import { Feed as RSSFeed } from "feed";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import { jsonResponse } from "../lib/response.ts";
import { CreateFeedSchema, getFirstError } from "../lib/schemas.ts";
import type { Feed, StoredEmail } from "../types.ts";
import { authenticateRequest } from "./auth.ts";
import { handleWebView } from "./viewer.ts";

type WorkerEnv = typeof worker.Env;
const MAX_FEEDS_PER_USER = 25;

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const apiFeedRoutes = new Hono<{ Bindings: WorkerEnv }>();
export const publicFeedRoutes = new Hono<{ Bindings: WorkerEnv }>();

export async function handleCreateFeed(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = await request.json();
    const { name } = CreateFeedSchema.parse(body);

    const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
    const userFeeds: (string | Omit<Feed, "userId">)[] = userFeedsData
      ? JSON.parse(userFeedsData)
      : [];

    if (userFeeds.length >= MAX_FEEDS_PER_USER) {
      return jsonResponse(
        { error: `Feed limit reached (${MAX_FEEDS_PER_USER} max per account)` },
        409
      );
    }

    const feedId = nanoid(10);
    const emailAddress = `${feedId}@${env.INBOUND_EMAIL_DOMAIN}`;

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

    // Keep this denormalized shape in sync with any future feed update path.
    userFeeds.push({
      id: feed.id,
      name: feed.name,
      emailAddress: feed.emailAddress,
      createdAt: feed.createdAt,
    });
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
      201
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
  env: WorkerEnv
): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
    const userFeeds: (string | Omit<Feed, "userId">)[] = userFeedsData
      ? JSON.parse(userFeedsData)
      : [];

    const feedsWithNulls = await Promise.all(
      userFeeds.map(async (item) => {
        if (typeof item !== "string") {
          return {
            id: item.id,
            name: item.name,
            emailAddress: item.emailAddress,
            createdAt: item.createdAt,
          };
        }

        // Legacy string entry predating denormalization: fetch to hydrate.
        const feedData = await env.DATA.get(`feed:${item}`);
        if (!feedData) {
          return null;
        }

        const feed: Feed = JSON.parse(feedData);
        return {
          id: feed.id,
          name: feed.name,
          emailAddress: feed.emailAddress,
          createdAt: feed.createdAt,
        };
      })
    );

    const feeds = feedsWithNulls.filter(
      (f): f is Omit<Feed, "userId"> => f !== null
    );

    return jsonResponse({ feeds });
  } catch (error) {
    console.error("List feeds error:", error);
    return jsonResponse({ error: "Failed to list feeds" }, 500);
  }
}

async function removeFeedFromUserIndex(
  env: WorkerEnv,
  userId: string,
  feedId: string
): Promise<boolean> {
  const userFeedsData = await env.DATA.get(`user:${userId}:feeds`);
  const userFeeds: (string | Omit<Feed, "userId">)[] = userFeedsData
    ? JSON.parse(userFeedsData)
    : [];
  const updatedFeeds = userFeeds.filter((item) => {
    const id = typeof item === "string" ? item : item.id;
    return id !== feedId;
  });

  if (updatedFeeds.length === userFeeds.length) {
    return false;
  }

  await env.DATA.put(`user:${userId}:feeds`, JSON.stringify(updatedFeeds));
  return true;
}

export async function handleDeleteFeed(
  request: Request,
  env: WorkerEnv,
  executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
  feedId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    // Get feed and verify ownership
    const feedData = await env.DATA.get(`feed:${feedId}`);
    if (!feedData) {
      // The blob can be gone while an index entry survives if a previous
      // delete failed partway; prune it so retrying the delete heals the
      // list instead of 404ing forever.
      const removedDangling = await removeFeedFromUserIndex(
        env,
        auth.userId,
        feedId
      );
      if (removedDangling) {
        return jsonResponse({ message: "Feed deleted" });
      }
      return jsonResponse({ error: "Feed not found" }, 404);
    }

    const feed: Feed = JSON.parse(feedData);
    if (feed.userId !== auth.userId) {
      return jsonResponse({ error: "Not authorized" }, 403);
    }

    // Get all emails for this feed and delete them
    const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
    const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];
    const cleanupKey = `feed:${feedId}:cleanup`;

    if (emailIds.length > 0) {
      await env.DATA.put(
        cleanupKey,
        JSON.stringify({
          emailIds,
          requestedAt: new Date().toISOString(),
        })
      );
    }

    // Delete emails in background using waitUntil so we don't block the HTTP response
    executionCtx.waitUntil(
      (async () => {
        const results = await Promise.allSettled(
          emailIds.map((emailId) => env.DATA.delete(`email:${emailId}`))
        );
        const failedEmailIds = results.flatMap((result, index) =>
          result.status === "rejected" ? [emailIds[index]] : []
        );
        if (failedEmailIds.length > 0) {
          await env.DATA.put(
            cleanupKey,
            JSON.stringify({
              emailIds: failedEmailIds,
              failedAt: new Date().toISOString(),
            })
          );
          console.error(
            `Failed to delete ${failedEmailIds.length}/${emailIds.length} emails for feed ${feedId}`
          );
          return;
        }
        await env.DATA.delete(cleanupKey);
      })()
    );

    // Remove from the user index before deleting the blob: a failure
    // partway then leaves an orphaned blob (invisible, delete retryable)
    // rather than a listed feed that no longer exists.
    await removeFeedFromUserIndex(env, auth.userId, feedId);

    // Always clean up feed metadata
    await env.DATA.delete(`feed:${feedId}`);
    await env.DATA.delete(`feed:${feedId}:emails`);
    // Clean up cache
    await env.DATA.delete(`feed:${feedId}:rss`);
    await env.DATA.delete(`feed:${feedId}:atom`);

    return jsonResponse({ message: "Feed deleted" });
  } catch (error) {
    console.error("Delete feed error:", error);
    return jsonResponse({ error: "Failed to delete feed" }, 500);
  }
}

export async function handleGetFeed(
  request: Request,
  env: WorkerEnv,
  feedId: string,
  format: "rss" | "atom"
): Promise<Response> {
  const contentType =
    format === "atom"
      ? "application/atom+xml; charset=utf-8"
      : "application/rss+xml; charset=utf-8";

  try {
    // Get feed metadata and email list upfront to compute etag
    const [feedData, emailListData] = await Promise.all([
      env.DATA.get(`feed:${feedId}`),
      env.DATA.get(`feed:${feedId}:emails`),
    ]);

    if (!feedData) {
      return jsonResponse({ error: "Feed not found" }, 404);
    }

    const emailIds: string[] = emailListData
      ? JSON.parse(emailListData).slice(0, 50)
      : [];

    const latestId = emailIds[0] || "empty";
    const etag = `W/"${feedId}:${format}:${latestId}:${emailIds.length}"`;
    const ifNoneMatch = request.headers.get("if-none-match");

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "cache-control": "public, max-age=300",
          "access-control-allow-origin": "*",
        },
      });
    }

    // Include the etag in the cache key so stale generators cannot overwrite
    // the cache entry for the latest feed version after invalidation.
    const cacheKey = `feed:${feedId}:${format}:${encodeURIComponent(etag)}`;
    const cachedFeed = await env.DATA.get(cacheKey);

    if (cachedFeed) {
      return new Response(cachedFeed, {
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=300",
          etag,
          "access-control-allow-origin": "*",
        },
      });
    }

    const feed: Feed = JSON.parse(feedData);
    const baseUrl = trimTrailingSlash(env.APP_BASE_URL);

    // Fetch emails
    const emailDataPromises = emailIds.map((id) => env.DATA.get(`email:${id}`));
    const emailDataList = await Promise.all(emailDataPromises);

    const emails: StoredEmail[] = [];
    for (const emailData of emailDataList) {
      if (emailData) {
        emails.push(JSON.parse(emailData));
      }
    }

    // Build feed
    const rssFeed = new RSSFeed({
      title: feed.name,
      description: `Newsletter feed: ${feed.name}`,
      id: `${baseUrl}/feeds/${feedId}`,
      link: `${baseUrl}/feeds/${feedId}`,
      language: "en",
      updated: emails.length > 0 ? new Date(emails[0].timestamp) : new Date(),
      generator: "unletter",
      copyright: "",
    });

    for (const email of emails) {
      rssFeed.addItem({
        title: email.subject,
        id: `${baseUrl}/feeds/${feedId}/view/${email.id}`,
        link: `${baseUrl}/feeds/${feedId}/view/${email.id}`,
        description: email.text.slice(0, 500),
        content: email.html,
        author: [{ name: email.from.name || email.from.email }],
        date: new Date(email.timestamp),
      });
    }

    const output = format === "atom" ? rssFeed.atom1() : rssFeed.rss2();

    // Cache the output (1 week TTL as safety net)
    await env.DATA.put(cacheKey, output, { expirationTtl: 604_800 });

    return new Response(output, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=300",
        etag,
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("Feed generation error:", error);
    return jsonResponse({ error: "Failed to generate feed" }, 500);
  }
}

apiFeedRoutes.post("/", (c) => handleCreateFeed(c.req.raw, c.env));
apiFeedRoutes.get("/", (c) => handleListFeeds(c.req.raw, c.env));
apiFeedRoutes.delete("/:feedId", (c) =>
  handleDeleteFeed(c.req.raw, c.env, c.executionCtx, c.req.param("feedId"))
);

publicFeedRoutes.get("/:feedId/view/:emailId", (c) =>
  handleWebView(c.env, c.req.param("feedId"), c.req.param("emailId"))
);
publicFeedRoutes.get("/:feedId/atom", (c) =>
  handleGetFeed(c.req.raw, c.env, c.req.param("feedId"), "atom")
);
publicFeedRoutes.get("/:feedId/rss", (c) =>
  handleGetFeed(c.req.raw, c.env, c.req.param("feedId"), "rss")
);
publicFeedRoutes.get("/:feedId", (c) =>
  handleGetFeed(c.req.raw, c.env, c.req.param("feedId"), "rss")
);
