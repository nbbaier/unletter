import { describe, expect, it } from "vitest";
import { handleAdminList, handleWaitlistSignup } from "../routes/waitlist.ts";
import { createMockEnv } from "./utils.ts";

function createWaitlistRequest(body: unknown): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Waitlist Routes", () => {
  it("should accept honeypot submissions without storing them", async () => {
    const env = createMockEnv();

    const response = await handleWaitlistSignup(
      createWaitlistRequest({ email: "bot@example.com", website: "spam" }),
      env
    );

    expect(response.status).toBe(201);
    const stored = await env.WAITLIST.get("bot@example.com");
    expect(stored).toBeNull();
  });

  it("should require turnstile token when turnstile is configured", async () => {
    const env = createMockEnv();
    env.TURNSTILE_SECRET = "turnstile-secret";

    const response = await handleWaitlistSignup(
      createWaitlistRequest({ email: "human@example.com" }),
      env
    );

    expect(response.status).toBe(400);
  });

  it("should reject admin list requests with invalid keys", async () => {
    const env = createMockEnv();
    const response = await handleAdminList(
      new Request("http://localhost/admin/waitlist", {
        headers: {
          authorization: "Bearer wrong-key",
        },
      }),
      env
    );

    expect(response.status).toBe(401);
  });
});
