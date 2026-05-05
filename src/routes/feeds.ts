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

    // Update user's feed list
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

    const feeds: Omit<Feed, "userId">[] = [];
    let needsMigration = false;

    const feedDataList = await Promise.all(
      userFeeds.map(async (item) => {
        if (typeof item === "string") {
          needsMigration = true;
          const feedData = await env.DATA.get(`feed:${item}`);
          if (feedData) {
            const feed: Feed = JSON.parse(feedData);
            return {
              id: feed.id,
              name: feed.name,
              emailAddress: feed.emailAddress,
              createdAt: feed.createdAt,
            };
          }
          return null;
        }
        return item;
      })
    );

    for (const feed of feedDataList) {
      if (feed) {
        feeds.push(feed);
      }
    }

    if (needsMigration) {
      await env.DATA.put(`user:${auth.userId}:feeds`, JSON.stringify(feeds));
    }

    return jsonResponse({ feeds });
  } catch (error) {
    console.error("List feeds error:", error);
    return jsonResponse({ error: "Failed to list feeds" }, 500);
  }
}

export async function handleDeleteFeed(
  request: Request,
  env: WorkerEnv,
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
      return jsonResponse({ error: "Feed not found" }, 404);
    }

    const feed: Feed = JSON.parse(feedData);
    if (feed.userId !== auth.userId) {
      return jsonResponse({ error: "Not authorized" }, 403);
    }

    // Get all emails for this feed and delete them
    const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
    const emailIds: string[] = emailListData ? JSON.parse(emailListData) : [];

    // Delete emails in parallel, using allSettled to ensure cleanup
    // continues even if individual deletes fail
    const results = await Promise.allSettled(
      emailIds.map((emailId) => env.DATA.delete(`email:${emailId}`))
    );
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(
        `Failed to delete ${failures.length}/${emailIds.length} emails for feed ${feedId}`
      );
    }

    // Always clean up feed metadata and user index
    await env.DATA.delete(`feed:${feedId}`);
    await env.DATA.delete(`feed:${feedId}:emails`);

    // Remove from user's feed list
    const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
    const userFeeds: (string | Omit<Feed, "userId">)[] = userFeedsData
      ? JSON.parse(userFeedsData)
      : [];
    const updatedFeeds = userFeeds.filter((item) => {
      const id = typeof item === "string" ? item : item.id;
      return id !== feedId;
    });
    await env.DATA.put(
      `user:${auth.userId}:feeds`,
      JSON.stringify(updatedFeeds)
    );

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
  try {
    // Get feed metadata
    const feedData = await env.DATA.get(`feed:${feedId}`);
    if (!feedData) {
      return jsonResponse({ error: "Feed not found" }, 404);
    }

    const feed: Feed = JSON.parse(feedData);
    const baseUrl = trimTrailingSlash(env.APP_BASE_URL);

    // Get email list (limit to 50 most recent)
    const emailListData = await env.DATA.get(`feed:${feedId}:emails`);
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

    const contentType =
      format === "atom"
        ? "application/atom+xml; charset=utf-8"
        : "application/rss+xml; charset=utf-8";

    const output = format === "atom" ? rssFeed.atom1() : rssFeed.rss2();

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
  handleDeleteFeed(c.req.raw, c.env, c.req.param("feedId"))
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
