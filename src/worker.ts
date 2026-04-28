import { Hono } from "hono";
import type { worker } from "../alchemy.run.ts";
import { validateEnv } from "./lib/env.ts";
import { authRoutes } from "./routes/auth.ts";
import { apiFeedRoutes, publicFeedRoutes } from "./routes/feeds.ts";
import { adminWaitlistRoutes, waitlistRoutes } from "./routes/waitlist.ts";
import { webhookRoutes } from "./routes/webhook.ts";

// biome-ignore lint/performance/noBarrelFile: Needed for cloudflare workers
export { RateLimiterDO } from "./durable-objects/rate-limiter.ts";

let envValidated = false;
type WorkerEnv = typeof worker.Env;
const app = new Hono<{ Bindings: WorkerEnv }>();
const apiRoutes = new Hono<{ Bindings: WorkerEnv }>();

const PRE_FLIGHT_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function createRequestID(): string {
  return crypto.randomUUID();
}

function ensureEnvironmentValidated(env: WorkerEnv): Response | null {
  if (envValidated) {
    return null;
  }

  try {
    validateEnv(env);
    envValidated = true;
    return null;
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        error: "Service configuration error. Please contact administrator.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

function createHealthResponse(env: WorkerEnv): Response {
  const version =
    (env as Record<string, unknown>).APP_VERSION ??
    (env as Record<string, unknown>).VERSION ??
    "unknown";

  return new Response(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
    }
  );
}

app.use("*", async (c, next) => {
  const validationError = ensureEnvironmentValidated(c.env);
  if (validationError) {
    return validationError;
  }

  const requestID = createRequestID();
  const startTime = Date.now();

  await next();

  const durationMs = Date.now() - startTime;
  c.res = new Response(c.res.body, {
    headers: c.res.headers,
    status: c.res.status,
    statusText: c.res.statusText,
  });
  c.res.headers.set("x-request-id", requestID);

  console.log(
    JSON.stringify({
      level: "info",
      event: "request.completed",
      requestID,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    })
  );
});

app.options("*", () => new Response(null, { headers: PRE_FLIGHT_HEADERS }));

apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/feeds", apiFeedRoutes);
apiRoutes.route("/webhook", webhookRoutes);
apiRoutes.route("/waitlist", waitlistRoutes);

app.route("/api", apiRoutes);
app.route("/admin", adminWaitlistRoutes);
app.route("/feeds", publicFeedRoutes);
app.get("/health", (c) => createHealthResponse(c.env));

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
