import { Feed as RSSFeed } from "feed";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import { jsonResponse } from "../lib/response.ts";
import { CreateFeedSchema, getFirstError } from "../lib/schemas.ts";
import type { Feed, StoredEmail } from "../types.ts";
import { authenticateRequest } from "./auth.ts";

export async function handleCreateFeed(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (auth instanceof Response) return auth;

	try {
		const body = await request.json();
		const { name } = CreateFeedSchema.parse(body);

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
		const userFeeds: string[] = userFeedsData ? JSON.parse(userFeedsData) : [];
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
		if (error instanceof z.ZodError) {
			return jsonResponse({ error: getFirstError(error) }, 400);
		}
		console.error("Create feed error:", error);
		return jsonResponse({ error: "Failed to create feed" }, 500);
	}
}

export async function handleListFeeds(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (auth instanceof Response) return auth;

	try {
		const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
		const feedIds: string[] = userFeedsData ? JSON.parse(userFeedsData) : [];

		const feeds: Array<Omit<Feed, "userId">> = [];

		const feedDataList = await Promise.all(
			feedIds.map((feedId) => env.DATA.get(`feed:${feedId}`)),
		);

		for (const feedData of feedDataList) {
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

export async function handleDeleteFeed(
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
		const userFeeds: string[] = userFeedsData ? JSON.parse(userFeedsData) : [];
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

export async function handleGetFeed(
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
