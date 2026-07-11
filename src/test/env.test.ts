import { describe, expect, it } from "vitest";
import type { worker } from "../../alchemy.run.ts";
import { validateEnv } from "../lib/env.ts";

const createValidEnv = (): typeof worker.Env =>
  ({
    ADMIN_API_KEY: "admin-api-key-for-environment-tests",
    APP_BASE_URL: "https://unletter.test",
    INBOUND_EMAIL_DOMAIN: "inbound.unletter.test",
    JWT_SECRET: "jwt-secret-that-is-at-least-32-characters-long",
    TURNSTILE_SECRET: "turnstile-secret-for-environment-tests",
    WEBHOOK_SECRET: "webhook-secret-for-environment-tests",
  }) as unknown as typeof worker.Env;

describe("validateEnv", () => {
  it("accepts a valid environment", () => {
    expect(() => validateEnv(createValidEnv())).not.toThrow();
  });

  it("rejects an empty WEBHOOK_SECRET", () => {
    expect(() =>
      validateEnv({ ...createValidEnv(), WEBHOOK_SECRET: "" })
    ).toThrow("WEBHOOK_SECRET must be set to a non-empty, secure value");
  });

  it("rejects the placeholder WEBHOOK_SECRET", () => {
    expect(() =>
      validateEnv({
        ...createValidEnv(),
        WEBHOOK_SECRET: "change-me-in-production",
      })
    ).toThrow("WEBHOOK_SECRET must be set to a secure value");
  });

  it("rejects a whitespace-only WEBHOOK_SECRET", () => {
    expect(() =>
      validateEnv({ ...createValidEnv(), WEBHOOK_SECRET: "   " })
    ).toThrow("WEBHOOK_SECRET must be set to a non-empty, secure value");
  });
});
