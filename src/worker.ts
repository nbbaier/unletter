import type { worker } from "../alchemy.run.ts";
import { validateEnv } from "./lib/env.ts";
import { handleLogin, handleSignup } from "./routes/auth.ts";
import {
  handleCreateFeed,
  handleDeleteFeed,
  handleGetFeed,
  handleListFeeds,
} from "./routes/feeds.ts";
import { handleWebView } from "./routes/viewer.ts";
import { handleAdminList, handleWaitlistSignup } from "./routes/waitlist.ts";
import { handleInboundWebhook } from "./routes/webhook.ts";

// biome-ignore lint/performance/noBarrelFile: Needed for cloudflare workers
export { RateLimiterDO } from "./durable-objects/rate-limiter.ts";

// Worker state to track if environment has been validated
let envValidated = false;

const FEED_ROUTE_PATTERN = /^\/feeds\/([^/]+)(\/rss|\/atom)?$/;
const VIEW_ROUTE_PATTERN = /^\/feeds\/([^/]+)\/view\/([^/]+)$/;
const API_FEEDS_PREFIX = "/api/feeds/";
type WorkerEnv = typeof worker.Env;

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

function handlePreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}

function handleApiRoutes(
  request: Request,
  env: WorkerEnv,
  url: URL
): Promise<Response> | null {
  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    return handleSignup(request, env);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/feeds" && request.method === "POST") {
    return handleCreateFeed(request, env);
  }

  if (url.pathname === "/api/feeds" && request.method === "GET") {
    return handleListFeeds(request, env);
  }

  if (
    url.pathname.startsWith(API_FEEDS_PREFIX) &&
    request.method === "DELETE"
  ) {
    const feedId = url.pathname.slice(API_FEEDS_PREFIX.length);
    return handleDeleteFeed(request, env, feedId);
  }

  if (url.pathname === "/api/webhook/inbound" && request.method === "POST") {
    return handleInboundWebhook(request, env);
  }

  if (url.pathname === "/api/waitlist" && request.method === "POST") {
    return handleWaitlistSignup(request, env);
  }

  if (url.pathname === "/admin/waitlist" && request.method === "GET") {
    return handleAdminList(request, env);
  }

  return null;
}

function handlePublicRoutes(
  request: Request,
  env: WorkerEnv,
  url: URL
): Promise<Response> | null {
  if (request.method !== "GET") {
    return null;
  }

  const feedMatch = url.pathname.match(FEED_ROUTE_PATTERN);
  if (feedMatch) {
    const feedId = feedMatch[1];
    const format = feedMatch[2] === "/atom" ? "atom" : "rss";
    return handleGetFeed(env, feedId, format);
  }

  const viewMatch = url.pathname.match(VIEW_ROUTE_PATTERN);
  if (viewMatch) {
    const feedId = viewMatch[1];
    const emailId = viewMatch[2];
    return handleWebView(env, feedId, emailId);
  }

  return null;
}

function handleHealthRoute(
  request: Request,
  env: WorkerEnv,
  url: URL
): Response | null {
  if (url.pathname !== "/health" || request.method !== "GET") {
    return null;
  }

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

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const validationError = ensureEnvironmentValidated(env);
    if (validationError) {
      return Promise.resolve(validationError);
    }

    const preflightResponse = handlePreflight(request);
    if (preflightResponse) {
      return Promise.resolve(preflightResponse);
    }

    const url = new URL(request.url);

    const apiResponse = handleApiRoutes(request, env, url);
    if (apiResponse) {
      return apiResponse;
    }

    const publicResponse = handlePublicRoutes(request, env, url);
    if (publicResponse) {
      return publicResponse;
    }

    const healthResponse = handleHealthRoute(request, env, url);
    if (healthResponse) {
      return Promise.resolve(healthResponse);
    }

    return env.ASSETS.fetch(request);
  },
};
