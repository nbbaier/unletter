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

      const request = createMockRequest(
        "DELETE",
        undefined,
        {
          Authorization: `Bearer ${token}`,
        },
        `http://localhost/api/feeds/${feedId}`
      );

      const response = await handleDeleteFeed(request, env, feedId);

      expect(response.status).toBe(200);
      const data = (await response.json()) as { message: string };
      expect(data.message).toBe("Feed deleted");
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
