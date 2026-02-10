import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import {
	DurableRateLimiter,
	getClientIP,
	rateLimitResponse,
} from "../lib/rate-limit.ts";
import { jsonResponse } from "../lib/response.ts";
import { getFirstError, WaitlistSchema } from "../lib/schemas.ts";

interface WaitlistEntry {
	email: string;
	timestamp: string;
	userAgent: string;
	referrer: string;
}

export async function handleWaitlistSignup(
	request: Request,
	env: typeof worker.Env,
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
		const { email } = WaitlistSchema.parse(body);

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

		await env.WAITLIST.put(email, JSON.stringify(entry));

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
	env: typeof worker.Env,
): Promise<Response> {
	const authHeader = request.headers.get("authorization");
	const expectedKey = env.ADMIN_API_KEY;

	// Fail closed: require a properly configured API key
	if (!expectedKey || expectedKey.trim() === "") {
		console.error("ADMIN_API_KEY is not configured");
		return jsonResponse({ error: "Server misconfigured" }, 500);
	}

	if (authHeader !== `Bearer ${expectedKey}`) {
		return jsonResponse({ error: "Unauthorized" }, 401);
	}

	try {
		const emails: WaitlistEntry[] = [];
		let listComplete = false;
		let cursor: string | undefined;

		while (!listComplete) {
			const list = await env.WAITLIST.list({ cursor });
			listComplete = list.list_complete;
			cursor = list.list_complete ? undefined : list.cursor;

			const batchPromises = list.keys.map((key) => env.WAITLIST.get(key.name));
			const batchResults = await Promise.all(batchPromises);

			for (const value of batchResults) {
				if (value) {
					emails.push(JSON.parse(value));
				}
			}
		}

		emails.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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
