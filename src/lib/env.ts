import type { worker } from "../../alchemy.run.ts";

function validateAdminApiKey(value: string, errors: string[]): void {
  if (!value || value.trim() === "") {
    errors.push(
      "ADMIN_API_KEY must be set to a non-empty, secure value in production. This key protects admin endpoints."
    );
    return;
  }

  if (value === "change-me-in-production") {
    errors.push(
      "ADMIN_API_KEY must be set to a secure value in production. This key protects admin endpoints."
    );
  }
}

function validateJwtSecret(value: string, errors: string[]): void {
  if (!value || value.trim() === "") {
    errors.push(
      "JWT_SECRET must be set to a non-empty, secure value in production. This secret is used to sign authentication tokens."
    );
    return;
  }

  if (value === "change-me-in-production") {
    errors.push(
      "JWT_SECRET must be set to a secure value in production. This secret is used to sign authentication tokens."
    );
  }

  if (value.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long for security.");
  }
}

function validateWebhookSecret(value: string, errors: string[]): void {
  if (!value || value.trim() === "") {
    errors.push(
      "WEBHOOK_SECRET must be set to a non-empty, secure value in production. This secret authenticates the inbound email webhook."
    );
    return;
  }

  if (value === "change-me-in-production") {
    errors.push(
      "WEBHOOK_SECRET must be set to a secure value in production. This secret authenticates the inbound email webhook."
    );
  }
}

function validateAppBaseUrl(value: string, errors: string[]): void {
  if (!value) {
    errors.push("APP_BASE_URL must be set to a valid absolute URL.");
    return;
  }

  try {
    const parsedUrl = new URL(value);
    if (!(parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:")) {
      errors.push("APP_BASE_URL must use http or https.");
    }
  } catch {
    errors.push("APP_BASE_URL must be a valid absolute URL.");
  }
}

export function validateEnv(env: typeof worker.Env): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  validateAdminApiKey(env.ADMIN_API_KEY, errors);
  validateJwtSecret(env.JWT_SECRET, errors);
  validateWebhookSecret(env.WEBHOOK_SECRET, errors);

  const inboundEmailDomain = env.INBOUND_EMAIL_DOMAIN?.trim();
  if (!inboundEmailDomain) {
    errors.push("INBOUND_EMAIL_DOMAIN must be set to a valid email domain.");
  }

  validateAppBaseUrl(env.APP_BASE_URL?.trim() || "", errors);

  if (!env.TURNSTILE_SECRET || env.TURNSTILE_SECRET.trim() === "") {
    warnings.push(
      "TURNSTILE_SECRET is not configured. Waitlist bot protection is running in honeypot-only mode."
    );
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(
      `\n⚠️  Environment Warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`
    );
  }

  // Throw on errors
  if (errors.length > 0) {
    throw new Error(
      `\n❌ Environment Validation Failed:\n${errors.map((e) => `  - ${e}`).join("\n")}\n\nPlease configure these environment variables before deploying.`
    );
  }

  console.log("✓ Environment validation passed");
}
