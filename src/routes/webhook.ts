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
    id: z.string().min(1),
    recipient: z.string().min(3),
    subject: z.string().optional().default("(No subject)"),
    receivedAt: z.string(),
    from: z
      .object({
        text: z.string().optional().default("unknown@unknown"),
        addresses: z
          .array(
            z.object({
              address: z.string().optional(),
              name: z.string().optional(),
            })
          )
          .optional()
          .default([]),
      })
      .optional()
      .default({ text: "unknown@unknown", addresses: [] }),
    parsedData: z
      .object({
        textBody: z.string().optional().default(""),
        htmlBody: z.string().optional().default(""),
      })
      .optional()
      .default({ textBody: "", htmlBody: "" }),
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
  const feedId = recipientParts[0];
  const recipientDomain = recipientParts[1]?.toLowerCase();

  if (recipientParts.length !== 2 || !feedId || !recipientDomain) {
    return null;
  }

  return { feedId, domain: recipientDomain };
}

async function updateFeedEmailIndex(
  env: WorkerEnv,
  feedId: string,
  email: StoredEmail
): Promise<void> {
  const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
  const emailList: (string | StoredEmail)[] = emailListData
    ? JSON.parse(emailListData)
    : [];

  const emailId = email.id;

  // Deduplicate and move to front using indexOf + splice + unshift for performance
  let existingIndex = -1;
  for (let i = 0; i < emailList.length; i++) {
    const item = emailList[i];
    const itemId = typeof item === "string" ? item : item.id;
    if (itemId === emailId) {
      existingIndex = i;
      break;
    }
  }

  if (existingIndex !== -1) {
    emailList.splice(existingIndex, 1);
  }
  emailList.unshift(email);

  const retainedItems = emailList.slice(0, MAX_EMAILS_PER_FEED);
  const staleItems = emailList.slice(MAX_EMAILS_PER_FEED);
  const staleIds = staleItems.map((item) =>
    typeof item === "string" ? item : item.id
  );

  await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify(retainedItems));

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
      return jsonResponse({ success: true, emailId, duplicate: true });
    }

    const fromAddress = payload.email.from.addresses[0];
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
      id: emailId,
      feedId,
      subject: payload.email.subject,
      from: {
        name: fromName,
        email: fromEmail,
      },
      html: sanitizedHtml,
      text: payload.email.parsedData.textBody || "",
      timestamp: payload.email.receivedAt,
      webViewLink,
    };

    await env.DATA.put(`email:${emailId}`, JSON.stringify(storedEmail));
    await updateFeedEmailIndex(env, feedId, storedEmail);

    return jsonResponse({ success: true, emailId });
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
