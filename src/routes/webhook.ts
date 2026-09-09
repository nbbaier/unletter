import { Hono } from "hono";
import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import { extractWebViewLink } from "../lib/patterns.ts";
import { jsonResponse } from "../lib/response.ts";
import { sanitizeEmailContent } from "../lib/sanitize.ts";
import { timingSafeEqual } from "../lib/security.ts";
import type { InboundWebhookPayload, StoredEmail } from "../types.ts";

type WorkerEnv = typeof worker.Env;
export const MAX_EMAILS_PER_FEED = 200;
const MAX_EMAIL_CONTENT_CHARS = 500_000;

const InboundPayloadSchema = z.object({
  email: z.object({
    from: z
      .object({
        addresses: z
          .array(
            z.object({
              address: z.string().optional(),
              name: z.string().optional(),
            })
          )
          .optional()
          .default([]),
        text: z.string().optional().default("unknown@unknown"),
      })
      .optional()
      .default({ addresses: [], text: "unknown@unknown" }),
    id: z.string().min(1),
    parsedData: z
      .object({
        htmlBody: z.string().optional().default(""),
        textBody: z.string().optional().default(""),
      })
      .optional()
      .default({ htmlBody: "", textBody: "" }),
    receivedAt: z.string(),
    recipient: z.string().min(3),
    subject: z.string().optional().default("(No subject)"),
  }),
});

export const webhookRoutes = new Hono<{ Bindings: WorkerEnv }>();

function validateWebhookSecret(request: Request, env: WorkerEnv): boolean {
  const webhookToken =
    request.headers.get("x-webhook-verification-token") || "";
  return timingSafeEqual(webhookToken, env.WEBHOOK_SECRET);
}

function parseWebhookPayload(payload: unknown): InboundWebhookPayload {
  return InboundPayloadSchema.parse(payload) as InboundWebhookPayload;
}

function assertPayloadWithinLimit(payload: InboundWebhookPayload): void {
  const totalContentLength =
    payload.email.subject.length +
    payload.email.parsedData.textBody.length +
    payload.email.parsedData.htmlBody.length;

  if (totalContentLength > MAX_EMAIL_CONTENT_CHARS) {
    throw new Error("payload-too-large");
  }
}

function parseRecipient(
  recipient: string
): { domain: string; feedId: string } | null {
  const recipientParts = recipient.split("@");
  const [feedId, domainPart] = recipientParts;
  const recipientDomain = domainPart?.toLowerCase();

  if (recipientParts.length !== 2 || !feedId || !recipientDomain) {
    return null;
  }

  return { domain: recipientDomain, feedId };
}

async function updateFeedEmailIndex(
  env: WorkerEnv,
  feedId: string,
  emailId: string
): Promise<void> {
  const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
  const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];

  const dedupedIds = [emailId, ...emailIds.filter((id) => id !== emailId)];
  const retainedIds = dedupedIds.slice(0, MAX_EMAILS_PER_FEED);
  const staleIds = dedupedIds.slice(MAX_EMAILS_PER_FEED);

  await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify(retainedIds));

  if (staleIds.length === 0) {
    return;
  }

  const cleanupResults = await Promise.allSettled(
    staleIds.map((staleId) => env.DATA.delete(`email:${staleId}`))
  );
  const cleanupFailures = cleanupResults.filter(
    (result) => result.status === "rejected"
  );

  if (cleanupFailures.length > 0) {
    console.error(
      `Failed to clean up ${cleanupFailures.length}/${staleIds.length} stale emails for feed ${feedId}`
    );
  }
}

export async function handleInboundWebhook(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  if (!validateWebhookSecret(request, env)) {
    return jsonResponse({ error: "Invalid webhook signature" }, 401);
  }

  try {
    const payload = parseWebhookPayload(await request.json());
    assertPayloadWithinLimit(payload);

    const parsedRecipient = parseRecipient(payload.email.recipient);
    if (!parsedRecipient) {
      return jsonResponse({ error: "Invalid recipient address" }, 400);
    }

    if (parsedRecipient.domain !== env.INBOUND_EMAIL_DOMAIN.toLowerCase()) {
      return jsonResponse({ error: "Invalid recipient domain" }, 400);
    }

    const { feedId } = parsedRecipient;
    const feedData = await env.DATA.get(`feed:${feedId}`);
    if (!feedData) {
      return jsonResponse({ error: "Feed not found" }, 404);
    }

    const emailId = payload.email.id;
    const existingEmail = await env.DATA.get(`email:${emailId}`);
    if (existingEmail) {
      return jsonResponse({ duplicate: true, emailId, success: true });
    }

    const [fromAddress] = payload.email.from.addresses;
    const fromName = fromAddress?.name || "";
    const fromEmail = fromAddress?.address || payload.email.from.text;

    const webViewLink = payload.email.parsedData.htmlBody
      ? extractWebViewLink(payload.email.parsedData.htmlBody)
      : undefined;

    const { sanitizedHtml, hasScript, hasInlineStyle } = sanitizeEmailContent(
      payload.email.parsedData.htmlBody || ""
    );

    if (hasScript || hasInlineStyle) {
      console.warn(
        `Email ${payload.email.id} from ${fromEmail} contained potentially unsafe content ` +
          `(scripts: ${hasScript}, inline styles: ${hasInlineStyle}). Content sanitized.`
      );
    }

    const storedEmail: StoredEmail = {
      feedId,
      from: {
        email: fromEmail,
        name: fromName,
      },
      html: sanitizedHtml,
      id: emailId,
      subject: payload.email.subject,
      text: payload.email.parsedData.textBody || "",
      timestamp: payload.email.receivedAt,
      webViewLink,
    };

    await env.DATA.put(`email:${emailId}`, JSON.stringify(storedEmail));
    await updateFeedEmailIndex(env, feedId, emailId);

    // Invalidate feed cache
    await env.DATA.delete(`feed:${feedId}:rss`);
    await env.DATA.delete(`feed:${feedId}:atom`);

    return jsonResponse({ emailId, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid webhook payload" }, 400);
    }

    if (error instanceof Error && error.message === "payload-too-large") {
      return jsonResponse({ error: "Email payload too large" }, 413);
    }

    console.error("Webhook processing error:", error);
    return jsonResponse({ error: "Failed to process webhook" }, 500);
  }
}

webhookRoutes.post("/inbound", (c) => handleInboundWebhook(c.req.raw, c.env));
