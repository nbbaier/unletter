import { Feed as RSSFeed } from "feed";
import { nanoid } from "nanoid";
import type { worker } from "../alchemy.run.ts";
import {
	createToken,
	hashPassword,
	verifyPassword,
	verifyToken,
} from "./lib/auth.ts";
import { extractWebViewLink } from "./lib/patterns.ts";
import type {
	Feed,
	InboundWebhookPayload,
	StoredEmail,
	User,
} from "./types.ts";

interface WaitlistEntry {
	email: string;
	timestamp: string;
	userAgent: string;
	referrer: string;
}

export default {
	async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
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
			return handleSignup(request, env);
		}

		if (url.pathname === "/api/auth/login" && request.method === "POST") {
			return handleLogin(request, env);
		}

		// Feed routes (authenticated)
		if (url.pathname === "/api/feeds" && request.method === "POST") {
			return handleCreateFeed(request, env);
		}

		if (url.pathname === "/api/feeds" && request.method === "GET") {
			return handleListFeeds(request, env);
		}

		if (
			url.pathname.startsWith("/api/feeds/") &&
			request.method === "DELETE"
		) {
			const feedId = url.pathname.split("/api/feeds/")[1];
			return handleDeleteFeed(request, env, feedId);
		}

		// Webhook route
		if (
			url.pathname === "/api/webhook/inbound" &&
			request.method === "POST"
		) {
			return handleInboundWebhook(request, env);
		}

		// Public feed routes
		const feedMatch = url.pathname.match(/^\/feeds\/([^/]+)(\/rss|\/atom)?$/);
		if (feedMatch && request.method === "GET") {
			const feedId = feedMatch[1];
			const format = feedMatch[2] === "/atom" ? "atom" : "rss";
			return handleGetFeed(env, feedId, format);
		}

		// Web view route
		const viewMatch = url.pathname.match(
			/^\/feeds\/([^/]+)\/view\/([^/]+)$/,
		);
		if (viewMatch && request.method === "GET") {
			const feedId = viewMatch[1];
			const emailId = viewMatch[2];
			return handleWebView(env, feedId, emailId);
		}

		// Waitlist routes
		if (url.pathname === "/api/waitlist" && request.method === "POST") {
			return handleWaitlistSignup(request, env);
		}

		if (url.pathname === "/admin/waitlist" && request.method === "GET") {
			return handleAdminList(request, env);
		}

		return env.ASSETS.fetch(request);
	},
};

async function handleWaitlistSignup(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as { email: string };
		const email = body.email?.toLowerCase().trim() ?? "";

		// Validate email
		if (!email || !isValidEmail(email)) {
			return jsonResponse({ error: "Invalid email address" }, 400);
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
	const authHeader = request.headers.get("authorization");
	const expectedKey = env.ADMIN_API_KEY || "your-secret-key-here";

	if (authHeader !== `Bearer ${expectedKey}`) {
		return jsonResponse({ error: "Unauthorized" }, 401);
	}

	try {
		const list = await env.WAITLIST.list();
		const emails: WaitlistEntry[] = [];

		for (const key of list.keys) {
			const value = await env.WAITLIST.get(key.name);
			if (value) {
				emails.push(JSON.parse(value));
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

// Auth handlers

async function handleSignup(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			email: string;
			password: string;
		};
		const email = body.email?.toLowerCase().trim() ?? "";
		const password = body.password ?? "";

		if (!email || !isValidEmail(email)) {
			return jsonResponse({ error: "Invalid email address" }, 400);
		}

		if (!password || password.length < 8) {
			return jsonResponse(
				{ error: "Password must be at least 8 characters" },
				400,
			);
		}

		// Check if user already exists
		const existingUserId = await env.DATA.get(`user:email:${email}`);
		if (existingUserId) {
			return jsonResponse({ error: "Email already registered" }, 409);
		}

		// Create user
		const userId = nanoid();
		const passwordHash = await hashPassword(password);

		const user: User = {
			id: userId,
			email,
			passwordHash,
			createdAt: new Date().toISOString(),
		};

		// Store user and email index
		await env.DATA.put(`user:${userId}`, JSON.stringify(user));
		await env.DATA.put(`user:email:${email}`, userId);
		await env.DATA.put(`user:${userId}:feeds`, JSON.stringify([]));

		// Create JWT
		const token = await createToken(userId, env.JWT_SECRET);

		return jsonResponse(
			{
				token,
				user: {
					id: userId,
					email,
				},
			},
			201,
		);
	} catch (error) {
		console.error("Signup error:", error);
		return jsonResponse({ error: "Failed to create account" }, 500);
	}
}

async function handleLogin(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			email: string;
			password: string;
		};
		const email = body.email?.toLowerCase().trim() ?? "";
		const password = body.password ?? "";

		if (!email || !password) {
			return jsonResponse({ error: "Email and password required" }, 400);
		}

		// Look up user by email
		const userId = await env.DATA.get(`user:email:${email}`);
		if (!userId) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		const userData = await env.DATA.get(`user:${userId}`);
		if (!userData) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		const user: User = JSON.parse(userData);

		// Verify password
		const isValid = await verifyPassword(password, user.passwordHash);
		if (!isValid) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		// Create JWT
		const token = await createToken(userId, env.JWT_SECRET);

		return jsonResponse({
			token,
			user: {
				id: userId,
				email: user.email,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		return jsonResponse({ error: "Failed to log in" }, 500);
	}
}

// Auth middleware helper

async function authenticateRequest(
	request: Request,
	env: typeof worker.Env,
): Promise<{ userId: string } | Response> {
	const authHeader = request.headers.get("authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return jsonResponse({ error: "Authorization required" }, 401);
	}

	const token = authHeader.slice(7);
	const result = await verifyToken(token, env.JWT_SECRET);

	if (!result) {
		return jsonResponse({ error: "Invalid or expired token" }, 401);
	}

	return { userId: result.userId };
}

// Feed handlers

async function handleCreateFeed(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (auth instanceof Response) return auth;

	try {
		const body = (await request.json()) as { name: string };
		const name = body.name?.trim() ?? "";

		if (!name) {
			return jsonResponse({ error: "Feed name is required" }, 400);
		}

		const feedId = nanoid(10);
		const emailAddress = `${feedId}@unletter.app`;

		const feed: Feed = {
			id: feedId,
			userId: auth.userId,
			name,
			emailAddress,
			createdAt: new Date().toISOString(),
		};

		// Store feed
		await env.DATA.put(`feed:${feedId}`, JSON.stringify(feed));
		await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify([]));

		// Update user's feed list
		const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
		const userFeeds: string[] = userFeedsData
			? JSON.parse(userFeedsData)
			: [];
		userFeeds.push(feedId);
		await env.DATA.put(`user:${auth.userId}:feeds`, JSON.stringify(userFeeds));

		return jsonResponse(
			{
				feed: {
					id: feed.id,
					name: feed.name,
					emailAddress: feed.emailAddress,
					createdAt: feed.createdAt,
				},
			},
			201,
		);
	} catch (error) {
		console.error("Create feed error:", error);
		return jsonResponse({ error: "Failed to create feed" }, 500);
	}
}

async function handleListFeeds(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (auth instanceof Response) return auth;

	try {
		const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
		const feedIds: string[] = userFeedsData ? JSON.parse(userFeedsData) : [];

		const feeds: Array<Omit<Feed, "userId">> = [];

		for (const feedId of feedIds) {
			const feedData = await env.DATA.get(`feed:${feedId}`);
			if (feedData) {
				const feed: Feed = JSON.parse(feedData);
				feeds.push({
					id: feed.id,
					name: feed.name,
					emailAddress: feed.emailAddress,
					createdAt: feed.createdAt,
				});
			}
		}

		return jsonResponse({ feeds });
	} catch (error) {
		console.error("List feeds error:", error);
		return jsonResponse({ error: "Failed to list feeds" }, 500);
	}
}

async function handleDeleteFeed(
	request: Request,
	env: typeof worker.Env,
	feedId: string,
): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (auth instanceof Response) return auth;

	try {
		// Get feed and verify ownership
		const feedData = await env.DATA.get(`feed:${feedId}`);
		if (!feedData) {
			return jsonResponse({ error: "Feed not found" }, 404);
		}

		const feed: Feed = JSON.parse(feedData);
		if (feed.userId !== auth.userId) {
			return jsonResponse({ error: "Not authorized" }, 403);
		}

		// Get all emails for this feed and delete them
		const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
		const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];

		for (const emailId of emailIds) {
			await env.DATA.delete(`email:${emailId}`);
		}

		// Delete feed data
		await env.DATA.delete(`feed:${feedId}`);
		await env.DATA.delete(`feed:${feedId}:emails`);

		// Remove from user's feed list
		const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
		const userFeeds: string[] = userFeedsData
			? JSON.parse(userFeedsData)
			: [];
		const updatedFeeds = userFeeds.filter((id) => id !== feedId);
		await env.DATA.put(
			`user:${auth.userId}:feeds`,
			JSON.stringify(updatedFeeds),
		);

		return jsonResponse({ message: "Feed deleted" });
	} catch (error) {
		console.error("Delete feed error:", error);
		return jsonResponse({ error: "Failed to delete feed" }, 500);
	}
}

// Webhook handler

async function handleInboundWebhook(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	// Verify webhook signature
	const webhookToken = request.headers.get("x-webhook-verification-token");
	if (webhookToken !== env.WEBHOOK_SECRET) {
		return jsonResponse({ error: "Invalid webhook signature" }, 401);
	}

	try {
		const payload: InboundWebhookPayload = await request.json();

		// Extract feed ID from recipient address
		// Format: {feed-id}@unletter.app
		const recipient = payload.email.recipient;
		const feedId = recipient.split("@")[0];

		if (!feedId) {
			return jsonResponse({ error: "Invalid recipient address" }, 400);
		}

		// Look up feed
		const feedData = await env.DATA.get(`feed:${feedId}`);
		if (!feedData) {
			console.log(`Feed not found for recipient: ${recipient}`);
			return jsonResponse({ error: "Feed not found" }, 404);
		}

		// Extract sender info
		const fromAddress = payload.email.from.addresses[0];
		const fromName = fromAddress?.name || "";
		const fromEmail = fromAddress?.address || payload.email.from.text;

		// Extract web view link from HTML
		const webViewLink = payload.email.parsedData.htmlBody
			? extractWebViewLink(payload.email.parsedData.htmlBody)
			: undefined;

		// Create stored email
		const emailId = payload.email.id;
		const storedEmail: StoredEmail = {
			id: emailId,
			feedId,
			subject: payload.email.subject,
			from: {
				name: fromName,
				email: fromEmail,
			},
			html: payload.email.parsedData.htmlBody || "",
			text: payload.email.parsedData.textBody || "",
			timestamp: payload.email.receivedAt,
			webViewLink,
		};

		// Store email
		await env.DATA.put(`email:${emailId}`, JSON.stringify(storedEmail));

		// Update feed's email list (prepend to keep newest first)
		const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
		const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];
		emailIds.unshift(emailId);
		await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify(emailIds));

		console.log(`Stored email ${emailId} for feed ${feedId}`);

		return jsonResponse({ success: true, emailId });
	} catch (error) {
		console.error("Webhook processing error:", error);
		return jsonResponse({ error: "Failed to process webhook" }, 500);
	}
}

// RSS/Atom feed handler

async function handleGetFeed(
	env: typeof worker.Env,
	feedId: string,
	format: "rss" | "atom",
): Promise<Response> {
	try {
		// Get feed metadata
		const feedData = await env.DATA.get(`feed:${feedId}`);
		if (!feedData) {
			return jsonResponse({ error: "Feed not found" }, 404);
		}

		const feed: Feed = JSON.parse(feedData);

		// Get email list (limit to 50 most recent)
		const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
		const emailIds: string[] = emailListData
			? JSON.parse(emailListData).slice(0, 50)
			: [];

		// Fetch emails
		const emails: StoredEmail[] = [];
		for (const emailId of emailIds) {
			const emailData = await env.DATA.get(`email:${emailId}`);
			if (emailData) {
				emails.push(JSON.parse(emailData));
			}
		}

		// Build feed
		const rssFeed = new RSSFeed({
			title: feed.name,
			description: `Newsletter feed: ${feed.name}`,
			id: `https://unletter.app/feeds/${feedId}`,
			link: `https://unletter.app/feeds/${feedId}`,
			language: "en",
			updated: emails.length > 0 ? new Date(emails[0].timestamp) : new Date(),
			generator: "unletter",
			copyright: "",
		});

		for (const email of emails) {
			rssFeed.addItem({
				title: email.subject,
				id: `https://unletter.app/feeds/${feedId}/view/${email.id}`,
				link: `https://unletter.app/feeds/${feedId}/view/${email.id}`,
				description: email.text.slice(0, 500),
				content: email.html,
				author: [{ name: email.from.name || email.from.email }],
				date: new Date(email.timestamp),
			});
		}

		const contentType =
			format === "atom"
				? "application/atom+xml; charset=utf-8"
				: "application/rss+xml; charset=utf-8";

		const output = format === "atom" ? rssFeed.atom1() : rssFeed.rss2();

		return new Response(output, {
			headers: {
				"content-type": contentType,
				"cache-control": "public, max-age=300",
				"access-control-allow-origin": "*",
			},
		});
	} catch (error) {
		console.error("Feed generation error:", error);
		return jsonResponse({ error: "Failed to generate feed" }, 500);
	}
}

// Web view handler

async function handleWebView(
	env: typeof worker.Env,
	feedId: string,
	emailId: string,
): Promise<Response> {
	try {
		// Get email
		const emailData = await env.DATA.get(`email:${emailId}`);
		if (!emailData) {
			return new Response("Email not found", { status: 404 });
		}

		const email: StoredEmail = JSON.parse(emailData);

		// Verify email belongs to this feed
		if (email.feedId !== feedId) {
			return new Response("Email not found", { status: 404 });
		}

		// Format date
		const date = new Date(email.timestamp).toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		});

		// Build HTML page
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(email.subject)}</title>
	<style>
		:root {
			--ink: #1a1a1a;
			--paper: #fdfbf7;
			--accent: #d84315;
			--muted: #6b7280;
			--border: #e5dfd3;
		}
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: 'Work Sans', -apple-system, BlinkMacSystemFont, sans-serif;
			background: var(--paper);
			color: var(--ink);
			line-height: 1.6;
		}
		.header {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
			border-bottom: 1px solid var(--border);
		}
		.header h1 {
			font-family: 'Crimson Pro', serif;
			font-size: 1.75rem;
			font-weight: 600;
			margin-bottom: 0.5rem;
		}
		.meta {
			color: var(--muted);
			font-size: 0.875rem;
		}
		.meta a {
			color: var(--accent);
			text-decoration: none;
		}
		.meta a:hover {
			text-decoration: underline;
		}
		.content {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
		}
		.content img {
			max-width: 100%;
			height: auto;
		}
		.footer {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem 1rem;
			border-top: 1px solid var(--border);
			text-align: center;
			color: var(--muted);
			font-size: 0.875rem;
		}
		.footer a {
			color: var(--accent);
			text-decoration: none;
		}
	</style>
	<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=Work+Sans:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
	<header class="header">
		<h1>${escapeHtml(email.subject)}</h1>
		<p class="meta">
			From: ${escapeHtml(email.from.name || email.from.email)}<br>
			${date}
			${email.webViewLink ? `<br><a href="${escapeHtml(email.webViewLink)}" target="_blank" rel="noopener">View original</a>` : ""}
		</p>
	</header>
	<main class="content">
		${email.html || `<pre>${escapeHtml(email.text)}</pre>`}
	</main>
	<footer class="footer">
		<p>Delivered by <a href="https://unletter.app">unletter</a></p>
	</footer>
</body>
</html>`;

		return new Response(html, {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "public, max-age=3600",
			},
		});
	} catch (error) {
		console.error("Web view error:", error);
		return new Response("Error loading email", { status: 500 });
	}
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
