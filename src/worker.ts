import type { worker } from "../alchemy.run.ts";
import { validateEnv } from "./lib/env.ts";
import * as auth from "./routes/auth.ts";
import * as feeds from "./routes/feeds.ts";
import * as viewer from "./routes/viewer.ts";
import * as waitlist from "./routes/waitlist.ts";
import * as webhook from "./routes/webhook.ts";

// Worker state to track if environment has been validated
let envValidated = false;

export default {
	async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
		// Validate environment on first request (once per worker instance)
		if (!envValidated) {
			try {
				validateEnv(env);
				envValidated = true;
			} catch (error) {
				console.error(error);
				return new Response(
					JSON.stringify({
						error: "Service configuration error. Please contact administrator.",
					}),
					{
						status: 500,
						headers: { "content-type": "application/json" },
					},
				);
			}
		}

		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
					"access-control-allow-headers": "content-type, authorization",
				},
			});
		}

		// Auth routes
		if (url.pathname === "/api/auth/signup" && request.method === "POST") {
			return auth.handleSignup(request, env);
		}

		if (url.pathname === "/api/auth/login" && request.method === "POST") {
			return auth.handleLogin(request, env);
		}

		// Feed routes (authenticated)
		if (url.pathname === "/api/feeds" && request.method === "POST") {
			return feeds.handleCreateFeed(request, env);
		}

		if (url.pathname === "/api/feeds" && request.method === "GET") {
			return feeds.handleListFeeds(request, env);
		}

		if (url.pathname.startsWith("/api/feeds/") && request.method === "DELETE") {
			const feedId = url.pathname.split("/api/feeds/")[1];
			return feeds.handleDeleteFeed(request, env, feedId);
		}

		// Webhook route
		if (url.pathname === "/api/webhook/inbound" && request.method === "POST") {
			return webhook.handleInboundWebhook(request, env);
		}

		// Public feed routes
		const feedMatch = url.pathname.match(/^\/feeds\/([^/]+)(\/rss|\/atom)?$/);
		if (feedMatch && request.method === "GET") {
			const feedId = feedMatch[1];
			const format = feedMatch[2] === "/atom" ? "atom" : "rss";
			return feeds.handleGetFeed(env, feedId, format);
		}

		// Web view route
		const viewMatch = url.pathname.match(/^\/feeds\/([^/]+)\/view\/([^/]+)$/);
		if (viewMatch && request.method === "GET") {
			const feedId = viewMatch[1];
			const emailId = viewMatch[2];
			return viewer.handleWebView(env, feedId, emailId);
		}

		// Waitlist routes
		if (url.pathname === "/api/waitlist" && request.method === "POST") {
			return waitlist.handleWaitlistSignup(request, env);
		}

		if (url.pathname === "/admin/waitlist" && request.method === "GET") {
			return waitlist.handleAdminList(request, env);
		}

		// Health check endpoint
		if (url.pathname === "/health" && request.method === "GET") {
			return new Response(
				JSON.stringify({
					status: "healthy",
					timestamp: new Date().toISOString(),
					version: "1.0.0",
				}),
				{
					headers: {
						"content-type": "application/json",
						"cache-control": "no-cache",
					},
				},
			);
		}

		// Serve static assets
		return env.ASSETS.fetch(request);
	},
};
