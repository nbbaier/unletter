import { describe, expect, it } from "vitest";
import {
  handleInboundWebhook,
  MAX_EMAILS_PER_FEED,
} from "../routes/webhook.ts";
import { createMockEnv } from "./utils.ts";

function createWebhookPayload(emailId: string, feedId: string) {
  return {
    event: "email.received",
    timestamp: new Date().toISOString(),
    email: {
      id: emailId,
      recipient: `${feedId}@unletter.app`,
      subject: `Subject ${emailId}`,
      receivedAt: new Date().toISOString(),
      from: {
        text: "sender@example.com",
        addresses: [{ address: "sender@example.com", name: "Sender" }],
      },
      to: {
        text: `${feedId}@unletter.app`,
        addresses: [{ address: `${feedId}@unletter.app` }],
      },
      parsedData: {
        textBody: `Plain text ${emailId}`,
        htmlBody: `<p>HTML ${emailId}</p>`,
      },
    },
  };
}

function createWebhookRequest(payload: unknown, secret: string): Request {
  return new Request("http://localhost/api/webhook/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-verification-token": secret,
    },
    body: JSON.stringify(payload),
  });
}

describe("Webhook Routes", () => {
  it("should treat duplicate webhook deliveries as idempotent", async () => {
    const env = createMockEnv();
    const feedId = "feed-idempotent";

    await env.DATA.put(
      `feed:${feedId}`,
      JSON.stringify({
        id: feedId,
        userId: "user-1",
        name: "Idempotent Feed",
        emailAddress: `${feedId}@unletter.app`,
        createdAt: new Date().toISOString(),
      })
    );
    await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify([]));

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

    await env.DATA.put(
      `feed:${feedId}`,
      JSON.stringify({
        id: feedId,
        userId: "user-1",
        name: "Retention Feed",
        emailAddress: `${feedId}@unletter.app`,
        createdAt: new Date().toISOString(),
      })
    );
    await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify([]));

    const totalEmails = MAX_EMAILS_PER_FEED + 5;
    for (let index = 0; index < totalEmails; index += 1) {
      const payload = createWebhookPayload(`email-${index}`, feedId);
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
});
