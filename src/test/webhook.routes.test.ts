import { describe, expect, it } from "vitest";
import {
  handleInboundWebhook,
  MAX_EMAILS_PER_FEED,
} from "../routes/webhook.ts";
import { createMockEnv } from "./utils.ts";

function createWebhookPayload(emailId: string, feedId: string) {
  return {
    email: {
      from: {
        addresses: [{ address: "sender@example.com", name: "Sender" }],
        text: "sender@example.com",
      },
      id: emailId,
      parsedData: {
        htmlBody: `<p>HTML ${emailId}</p>`,
        textBody: `Plain text ${emailId}`,
      },
      receivedAt: new Date().toISOString(),
      recipient: `${feedId}@unletter.app`,
      subject: `Subject ${emailId}`,
      to: {
        addresses: [{ address: `${feedId}@unletter.app` }],
        text: `${feedId}@unletter.app`,
      },
    },
    event: "email.received",
    timestamp: new Date().toISOString(),
  };
}

async function seedFeed(env: ReturnType<typeof createMockEnv>, feedId: string) {
  await env.DATA.put(
    `feed:${feedId}`,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      emailAddress: `${feedId}@${env.INBOUND_EMAIL_DOMAIN}`,
      id: feedId,
      name: "Test Feed",
      userId: "user-1",
    })
  );
  await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify([]));
}

function createWebhookRequest(payload: unknown, secret: string): Request {
  return new Request("http://localhost/api/webhook/inbound", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-webhook-verification-token": secret,
    },
    method: "POST",
  });
}

describe("Webhook Routes", () => {
  it("should treat duplicate webhook deliveries as idempotent", async () => {
    const env = createMockEnv();
    const feedId = "feed-idempotent";
    await seedFeed(env, feedId);

    const payload = createWebhookPayload("email-duplicate", feedId);
    const firstResponse = await handleInboundWebhook(
      createWebhookRequest(payload, env.WEBHOOK_SECRET),
      env
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await handleInboundWebhook(
      createWebhookRequest(payload, env.WEBHOOK_SECRET),
      env
    );
    expect(secondResponse.status).toBe(200);
    const secondData = await secondResponse.json();
    expect(secondData.duplicate).toBe(true);

    const emailListRaw = await env.DATA.get(`feed:${feedId}:emails`);
    const emailList = emailListRaw
      ? (JSON.parse(emailListRaw) as string[])
      : [];
    expect(emailList).toEqual(["email-duplicate"]);
  });

  it("should cap retained emails per feed and delete stale records", async () => {
    const env = createMockEnv();
    const feedId = "feed-retention";
    await seedFeed(env, feedId);

    const totalEmails = MAX_EMAILS_PER_FEED + 5;
    for (let index = 0; index < totalEmails; index += 1) {
      const payload = createWebhookPayload(`email-${index}`, feedId);
      // biome-ignore lint/performance/noAwaitInLoops: sequential ingestion required for retention test
      const response = await handleInboundWebhook(
        createWebhookRequest(payload, env.WEBHOOK_SECRET),
        env
      );
      expect(response.status).toBe(200);
    }

    const emailListRaw = await env.DATA.get(`feed:${feedId}:emails`);
    const emailList = emailListRaw
      ? (JSON.parse(emailListRaw) as string[])
      : [];

    expect(emailList.length).toBe(MAX_EMAILS_PER_FEED);
    expect(emailList[0]).toBe(`email-${totalEmails - 1}`);
    expect(emailList.at(-1)).toBe("email-5");

    const staleEmail = await env.DATA.get("email:email-0");
    const retainedBoundaryEmail = await env.DATA.get("email:email-5");
    expect(staleEmail).toBeNull();
    expect(retainedBoundaryEmail).toBeTruthy();
  });

  it("should reject invalid webhook token", async () => {
    const env = createMockEnv();
    const feedId = "feed-auth";
    await seedFeed(env, feedId);

    const response = await handleInboundWebhook(
      createWebhookRequest(
        createWebhookPayload("email-auth", feedId),
        "wrong-token"
      ),
      env
    );

    expect(response.status).toBe(401);
  });

  it("should reject webhook payloads with invalid recipient domain", async () => {
    const env = createMockEnv();
    const feedId = "feed-domain";
    await seedFeed(env, feedId);

    const payload = createWebhookPayload("email-domain", feedId);
    payload.email.recipient = `${feedId}@evil.example`;

    const response = await handleInboundWebhook(
      createWebhookRequest(payload, env.WEBHOOK_SECRET),
      env
    );

    expect(response.status).toBe(400);
  });

  it("should reject malformed webhook payloads", async () => {
    const env = createMockEnv();

    const response = await handleInboundWebhook(
      createWebhookRequest({ nope: true }, env.WEBHOOK_SECRET),
      env
    );

    expect(response.status).toBe(400);
  });
});
