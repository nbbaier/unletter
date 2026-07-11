import { describe, expect, it } from "vitest";
import { handleSignup } from "../routes/auth.ts";
import {
  handleCreateFeed,
  handleDeleteFeed,
  handleGetFeed,
  handleListFeeds,
} from "../routes/feeds.ts";
import { createMockEnv } from "./utils.ts";

function createMockRequest(
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
  url = "http://localhost/api/feeds"
): Request {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function createTestUserAndGetToken(
  env: ReturnType<typeof createMockEnv>
): Promise<string> {
  const signupRequest = createMockRequest(
    "POST",
    {
      email: "testuser@example.com",
      password: "password123",
    },
    {},
    "http://localhost/api/auth/signup"
  );
  const response = await handleSignup(signupRequest, env);
  const data = await response.json();
  return data.token;
}

describe("Feed Management API", () => {
  describe("handleCreateFeed", () => {
    it("should create a new feed when authenticated", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      const request = createMockRequest(
        "POST",
        { name: "Test Feed" },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      const response = await handleCreateFeed(request, env);

      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        feed: {
          id: string;
          name: string;
          emailAddress: string;
          createdAt: string;
        };
      };
      expect(data.feed.id).toBeTruthy();
      expect(data.feed.emailAddress).toContain("@");
    });

    it("should use configured inbound email domain", async () => {
      const env = createMockEnv();
      env.INBOUND_EMAIL_DOMAIN = "letters.example.com";
      const token = await createTestUserAndGetToken(env);

      const request = createMockRequest(
        "POST",
        { name: "Domain Feed" },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      const response = await handleCreateFeed(request, env);
      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        feed: {
          emailAddress: string;
        };
      };

      expect(data.feed.emailAddress.endsWith("@letters.example.com")).toBe(
        true
      );
    });

    it("should reject feed creation without auth", async () => {
      const env = createMockEnv();
      const request = createMockRequest("POST", { name: "Test Feed" });

      const response = await handleCreateFeed(request, env);

      expect(response.status).toBe(401);
    });

    it("should reject feed creation with invalid token", async () => {
      const env = createMockEnv();
      const request = createMockRequest(
        "POST",
        { name: "Test Feed" },
        {
          Authorization: "Bearer invalid-token",
        }
      );

      const response = await handleCreateFeed(request, env);

      expect(response.status).toBe(401);
    });

    it("should reject feed creation beyond max feed quota", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      for (let index = 0; index < 25; index += 1) {
        const response = await handleCreateFeed(
          createMockRequest(
            "POST",
            { name: `Feed ${index}` },
            {
              Authorization: `Bearer ${token}`,
            }
          ),
          env
        );
        expect(response.status).toBe(201);
      }

      const quotaResponse = await handleCreateFeed(
        createMockRequest(
          "POST",
          { name: "Feed 26" },
          {
            Authorization: `Bearer ${token}`,
          }
        ),
        env
      );

      expect(quotaResponse.status).toBe(409);
    });
  });

  describe("handleListFeeds", () => {
    it("should list user feeds when authenticated", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      // Create a feed first
      await handleCreateFeed(
        createMockRequest(
          "POST",
          { name: "Test Feed" },
          { Authorization: `Bearer ${token}` }
        ),
        env
      );

      const request = createMockRequest("GET", undefined, {
        Authorization: `Bearer ${token}`,
      });

      const response = await handleListFeeds(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.feeds)).toBe(true);
      expect(data.feeds.length).toBeGreaterThan(0);
    });

    it("should serve denormalized entries without per-feed KV reads", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);
      const userId = await env.DATA.get("user:email:testuser@example.com");

      const seededFeeds = [
        {
          id: "feed-1",
          name: "First Feed",
          emailAddress: "feed-1@unletter.app",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "feed-2",
          name: "Second Feed",
          emailAddress: "feed-2@unletter.app",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ];
      await env.DATA.put(`user:${userId}:feeds`, JSON.stringify(seededFeeds));

      const originalGet = env.DATA.get.bind(env.DATA);
      let feedKeyReads = 0;
      env.DATA.get = ((key: string) => {
        if (key.startsWith("feed:")) {
          feedKeyReads += 1;
        }
        return originalGet(key);
      }) as typeof env.DATA.get;

      const response = await handleListFeeds(
        createMockRequest("GET", undefined, {
          Authorization: `Bearer ${token}`,
        }),
        env
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as { feeds: unknown[] };
      expect(data.feeds).toEqual(seededFeeds);
      expect(feedKeyReads).toBe(0);
    });

    it("should hydrate legacy string entries via per-feed fetch", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);
      const userId = await env.DATA.get("user:email:testuser@example.com");

      await env.DATA.put(`user:${userId}:feeds`, JSON.stringify(["legacy-1"]));
      await env.DATA.put(
        "feed:legacy-1",
        JSON.stringify({
          id: "legacy-1",
          userId,
          name: "Legacy Feed",
          emailAddress: "legacy-1@unletter.app",
          createdAt: "2025-12-01T00:00:00.000Z",
        })
      );

      const response = await handleListFeeds(
        createMockRequest("GET", undefined, {
          Authorization: `Bearer ${token}`,
        }),
        env
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as { feeds: unknown[] };
      expect(data.feeds).toEqual([
        {
          id: "legacy-1",
          name: "Legacy Feed",
          emailAddress: "legacy-1@unletter.app",
          createdAt: "2025-12-01T00:00:00.000Z",
        },
      ]);
    });

    it("should prune legacy string entries whose feed is missing", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);
      const userId = await env.DATA.get("user:email:testuser@example.com");

      await env.DATA.put(`user:${userId}:feeds`, JSON.stringify(["ghost-1"]));

      const response = await handleListFeeds(
        createMockRequest("GET", undefined, {
          Authorization: `Bearer ${token}`,
        }),
        env
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as { feeds: unknown[] };
      expect(data.feeds).toEqual([]);
    });

    it("should return empty array for user with no feeds", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      const request = createMockRequest("GET", undefined, {
        Authorization: `Bearer ${token}`,
      });

      const response = await handleListFeeds(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.feeds)).toBe(true);
      expect(data.feeds.length).toBe(0);
    });
  });

  describe("handleDeleteFeed", () => {
    it("should delete user feed when authenticated", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      // Create a feed first
      const createResponse = await handleCreateFeed(
        createMockRequest(
          "POST",
          { name: "Feed to Delete" },
          { Authorization: `Bearer ${token}` }
        ),
        env
      );
      const createData = (await createResponse.json()) as {
        feed: { id: string; emailAddress: string };
      };
      const feedId = createData.feed.id;
      await env.DATA.put(
        `feed:${feedId}:emails`,
        JSON.stringify(["email-1", "email-2"])
      );
      await env.DATA.put("email:email-1", JSON.stringify({ id: "email-1" }));
      await env.DATA.put("email:email-2", JSON.stringify({ id: "email-2" }));

      const request = createMockRequest(
        "DELETE",
        undefined,
        {
          Authorization: `Bearer ${token}`,
        },
        `http://localhost/api/feeds/${feedId}`
      );

      const waitUntilPromises: Promise<unknown>[] = [];
      const mockCtx = {
        waitUntil: (promise: Promise<unknown>) => {
          waitUntilPromises.push(promise);
        },
      };

      const response = await handleDeleteFeed(request, env, mockCtx, feedId);
      await Promise.all(waitUntilPromises);

      expect(response.status).toBe(200);
      const data = (await response.json()) as { message: string };
      expect(data.message).toBe("Feed deleted");
      await expect(env.DATA.get("email:email-1")).resolves.toBeNull();
      await expect(env.DATA.get("email:email-2")).resolves.toBeNull();
      await expect(env.DATA.get(`feed:${feedId}:cleanup`)).resolves.toBeNull();
    });

    it("should return 404 for a feed that never existed", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      const response = await handleDeleteFeed(
        createMockRequest(
          "DELETE",
          undefined,
          { Authorization: `Bearer ${token}` },
          "http://localhost/api/feeds/no-such-feed"
        ),
        env,
        { waitUntil: () => undefined },
        "no-such-feed"
      );

      expect(response.status).toBe(404);
    });

    it("should prune a dangling index entry when the feed blob is missing", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);
      const userId = await env.DATA.get("user:email:testuser@example.com");

      // Simulate a previous delete that removed the blob but failed before
      // updating the user index.
      await env.DATA.put(
        `user:${userId}:feeds`,
        JSON.stringify([
          {
            id: "ghost-1",
            name: "Ghost Feed",
            emailAddress: "ghost-1@unletter.app",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ])
      );

      const deleteResponse = await handleDeleteFeed(
        createMockRequest(
          "DELETE",
          undefined,
          { Authorization: `Bearer ${token}` },
          "http://localhost/api/feeds/ghost-1"
        ),
        env,
        { waitUntil: () => undefined },
        "ghost-1"
      );

      expect(deleteResponse.status).toBe(200);

      const listResponse = await handleListFeeds(
        createMockRequest("GET", undefined, {
          Authorization: `Bearer ${token}`,
        }),
        env
      );
      const data = (await listResponse.json()) as { feeds: unknown[] };
      expect(data.feeds).toEqual([]);
    });

    it("should not list a feed when blob deletion fails after index update", async () => {
      const env = createMockEnv();
      const token = await createTestUserAndGetToken(env);

      const createResponse = await handleCreateFeed(
        createMockRequest(
          "POST",
          { name: "Doomed Feed" },
          { Authorization: `Bearer ${token}` }
        ),
        env
      );
      const createData = (await createResponse.json()) as {
        feed: { id: string };
      };
      const feedId = createData.feed.id;

      const originalDelete = env.DATA.delete.bind(env.DATA);
      env.DATA.delete = ((key: string) => {
        if (key === `feed:${feedId}`) {
          return Promise.reject(new Error("KV delete failed"));
        }
        return originalDelete(key);
      }) as typeof env.DATA.delete;

      const deleteResponse = await handleDeleteFeed(
        createMockRequest(
          "DELETE",
          undefined,
          { Authorization: `Bearer ${token}` },
          `http://localhost/api/feeds/${feedId}`
        ),
        env,
        { waitUntil: () => undefined },
        feedId
      );

      expect(deleteResponse.status).toBe(500);

      const listResponse = await handleListFeeds(
        createMockRequest("GET", undefined, {
          Authorization: `Bearer ${token}`,
        }),
        env
      );
      const data = (await listResponse.json()) as { feeds: unknown[] };
      expect(data.feeds).toEqual([]);
    });
  });

  describe("handleGetFeed", () => {
    it("should return 304 when etag matches", async () => {
      const env = createMockEnv();
      const feedId = "etag-feed";

      await env.DATA.put(
        `feed:${feedId}`,
        JSON.stringify({
          id: feedId,
          userId: "user-1",
          name: "ETag Test Feed",
          emailAddress: `${feedId}@unletter.app`,
          createdAt: new Date().toISOString(),
        })
      );
      await env.DATA.put(`feed:${feedId}:emails`, JSON.stringify([]));

      const firstResponse = await handleGetFeed(
        new Request(`http://localhost/feeds/${feedId}/rss`),
        env,
        feedId,
        "rss"
      );

      expect(firstResponse.status).toBe(200);
      const etag = firstResponse.headers.get("etag");
      expect(etag).toBeTruthy();

      const secondResponse = await handleGetFeed(
        new Request(`http://localhost/feeds/${feedId}/rss`, {
          headers: {
            "if-none-match": etag || "",
          },
        }),
        env,
        feedId,
        "rss"
      );

      expect(secondResponse.status).toBe(304);
      expect(secondResponse.headers.get("etag")).toBe(etag);
    });
  });
});
