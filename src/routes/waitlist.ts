import { Hono } from "hono";
import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import {
  DurableRateLimiter,
  getClientIP,
  rateLimitResponse,
} from "../lib/rate-limit.ts";
import { jsonResponse } from "../lib/response.ts";
import { getFirstError, WaitlistSchema } from "../lib/schemas.ts";
import { timingSafeEqual } from "../lib/security.ts";

interface WaitlistEntry {
  email: string;
  referrer: string;
  timestamp: string;
  userAgent: string;
}

type WorkerEnv = typeof worker.Env;

export const waitlistRoutes = new Hono<{ Bindings: WorkerEnv }>();
export const adminWaitlistRoutes = new Hono<{ Bindings: WorkerEnv }>();

async function verifyTurnstileToken(
  token: string,
  remoteIP: string,
  secret: string
): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (remoteIP !== "unknown") {
    formData.set("remoteip", remoteIP);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

export async function handleWaitlistSignup(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  // Rate limiting: 5 waitlist signups per hour per IP
  const clientIP = getClientIP(request);
  const waitlistLimiter = new DurableRateLimiter(env.RATE_LIMITER, {
    limit: 5,
    window: 3600,
  });
  const rateLimitResult = await waitlistLimiter.check(`waitlist:${clientIP}`);

  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult);
  }

  try {
    const body = await request.json();
    const { email, turnstileToken, website } = WaitlistSchema.parse(body);

    // Honeypot trap for basic bots. Return a success-like response to avoid adaptation.
    if (website && website.trim() !== "") {
      return jsonResponse({ message: "Successfully added to waitlist!" }, 201);
    }

    const turnstileSecret = env.TURNSTILE_SECRET?.trim() || "";
    if (turnstileSecret !== "") {
      if (!turnstileToken) {
        return jsonResponse({ error: "Bot verification required" }, 400);
      }

      const isTurnstileValid = await verifyTurnstileToken(
        turnstileToken,
        clientIP,
        turnstileSecret
      );

      if (!isTurnstileValid) {
        return jsonResponse({ error: "Bot verification failed" }, 400);
      }
    }

    const existing = await env.WAITLIST.get(email);
    if (existing) {
      return jsonResponse({ message: "You're already on the waitlist!" }, 409);
    }

    const entry: WaitlistEntry = {
      email,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get("user-agent") || "unknown",
      referrer: request.headers.get("referer") || "direct",
    };

    await env.WAITLIST.put(email, JSON.stringify(entry), {
      metadata: entry,
    });

    return jsonResponse({ message: "Successfully added to waitlist!" }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: getFirstError(error) }, 400);
    }
    console.error("Waitlist signup error:", error);
    return jsonResponse({ error: "Failed to process signup" }, 500);
  }
}

export async function handleAdminList(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const expectedKey = env.ADMIN_API_KEY;

  // Fail closed: require a properly configured API key
  if (!expectedKey || expectedKey.trim() === "") {
    console.error("ADMIN_API_KEY is not configured");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const providedKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!timingSafeEqual(providedKey, expectedKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const emails: WaitlistEntry[] = [];
    let listComplete = false;
    let cursor: string | undefined;

    while (!listComplete) {
      const list = await env.WAITLIST.list({ cursor, metadata: true });
      listComplete = list.list_complete;
      cursor = list.list_complete ? undefined : list.cursor;

      const batchResults = await Promise.all(
        list.keys.map(async (key) => {
          // Optimization: check if entry is available in metadata to avoid N+1 queries
          if (key.metadata) {
            return key.metadata as WaitlistEntry;
          }

          // Fallback for entries created before metadata optimization
          const value = await env.WAITLIST.get(key.name);
          return value ? (JSON.parse(value) as WaitlistEntry) : null;
        })
      );

      for (const entry of batchResults) {
        if (entry) {
          emails.push(entry);
        }
      }
    }

    emails.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return jsonResponse({
      total: emails.length,
      emails,
    });
  } catch (error) {
    console.error("Admin list error:", error);
    return jsonResponse({ error: "Failed to fetch waitlist" }, 500);
  }
}

waitlistRoutes.post("/", (c) => handleWaitlistSignup(c.req.raw, c.env));
adminWaitlistRoutes.get("/waitlist", (c) => handleAdminList(c.req.raw, c.env));
