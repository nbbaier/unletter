import type { worker } from "../alchemy.run.ts";

interface WaitlistEntry {
	email: string;
	timestamp: string;
	userAgent: string;
	referrer: string;
}

export default {
	async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
		const url = new URL(request.url);

		// POST /api/waitlist - Add email to waitlist
		if (url.pathname === "/api/waitlist" && request.method === "POST") {
			return handleWaitlistSignup(request, env);
		}

		// GET /admin/waitlist - View all emails (requires auth)
		if (url.pathname === "/admin/waitlist" && request.method === "GET") {
			return handleAdminList(request, env);
		}

		// Serve static assets for all other requests
		return env.ASSETS.fetch(request);
	},
};

async function handleWaitlistSignup(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	try {
		const body = await request.json();
		const email = body.email?.toLowerCase().trim();

		// Validate email
		if (!email || !isValidEmail(email)) {
			return jsonResponse({ error: "Invalid email address" }, 400);
		}

		// Check for duplicate
		const existing = await env.WAITLIST.get(email);
		if (existing) {
			return jsonResponse(
				{ message: "You're already on the waitlist!" },
				409,
			);
		}

		// Collect metadata
		const entry: WaitlistEntry = {
			email,
			timestamp: new Date().toISOString(),
			userAgent: request.headers.get("user-agent") || "unknown",
			referrer: request.headers.get("referer") || "direct",
		};

		// Store in KV
		await env.WAITLIST.put(email, JSON.stringify(entry));

		return jsonResponse({ message: "Successfully added to waitlist!" }, 201);
	} catch (error) {
		console.error("Waitlist signup error:", error);
		return jsonResponse({ error: "Failed to process signup" }, 500);
	}
}

async function handleAdminList(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	// Simple API key authentication
	const authHeader = request.headers.get("authorization");
	const expectedKey = env.ADMIN_API_KEY || "your-secret-key-here";

	if (authHeader !== `Bearer ${expectedKey}`) {
		return jsonResponse({ error: "Unauthorized" }, 401);
	}

	try {
		// List all keys (emails) in KV namespace
		const list = await env.WAITLIST.list();
		const emails: WaitlistEntry[] = [];

		// Fetch each entry's metadata
		for (const key of list.keys) {
			const value = await env.WAITLIST.get(key.name);
			if (value) {
				emails.push(JSON.parse(value));
			}
		}

		// Sort by timestamp (newest first)
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

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json",
			"access-control-allow-origin": "*",
		},
	});
}
