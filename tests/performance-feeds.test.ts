import { describe, expect, test } from "vitest";
import { createToken } from "../src/lib/auth.ts";
import { handleListFeeds } from "../src/routes/feeds.ts";

// Mock user feeds and feed data
const USER_ID = "test-user";
const FEED_COUNT = 50;
const DELAY_MS = 10;
const JWT_SECRET = "performance-test-secret-key-with-32-characters";

const mockData = new Map<string, string>();

// Populate data
const feedIds: string[] = [];
for (let i = 0; i < FEED_COUNT; i++) {
  const feedId = `feed-${i}`;
  feedIds.push(feedId);
  mockData.set(
    `feed:${feedId}`,
    JSON.stringify({
      id: feedId,
      name: `Feed ${i}`,
      emailAddress: `feed${i}@example.com`,
      createdAt: new Date().toISOString(),
    })
  );
}
mockData.set(`user:${USER_ID}:feeds`, JSON.stringify(feedIds));

const mockEnv = {
  JWT_SECRET,
  DATA: {
    get: async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      return mockData.get(key) || null;
    },
    put: async (key: string, value: string) => {
      mockData.set(key, value);
    },
  },
} as unknown as Parameters<typeof handleListFeeds>[1];

describe("Performance Baseline", () => {
  test("measure handleListFeeds performance", async () => {
    const token = await createToken(USER_ID, JWT_SECRET);
    const start = performance.now();
    const response = await handleListFeeds(
      new Request("http://localhost/feeds", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      mockEnv
    );
    const end = performance.now();

    const duration = end - start;
    console.log("\n\n--- Performance Result ---");
    console.log(
      `Time taken to fetch ${FEED_COUNT} feeds with ${DELAY_MS}ms latency per fetch: ${duration.toFixed(2)}ms`
    );
    console.log("--------------------------\n");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { feeds: unknown[] };
    expect(data.feeds).toHaveLength(FEED_COUNT);
  });
});

// Populate denormalized data
const denormalizedFeeds: {
  id: string;
  name: string;
  emailAddress: string;
  createdAt: string;
}[] = [];
for (let i = 0; i < FEED_COUNT; i++) {
  denormalizedFeeds.push({
    id: `feed-${i}`,
    name: `Feed ${i}`,
    emailAddress: `feed${i}@example.com`,
    createdAt: new Date().toISOString(),
  });
}
mockData.set(`user:${USER_ID}_denorm:feeds`, JSON.stringify(denormalizedFeeds));

describe("Performance Optimized", () => {
  test("measure handleListFeeds performance with denormalization", async () => {
    const token = await createToken(`${USER_ID}_denorm`, JWT_SECRET);
    const start = performance.now();
    const response = await handleListFeeds(
      new Request("http://localhost/feeds", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      mockEnv
    );
    const end = performance.now();

    const duration = end - start;
    console.log("\n\n--- Performance Result (Optimized) ---");
    console.log(
      `Time taken to fetch ${FEED_COUNT} denormalized feeds: ${duration.toFixed(2)}ms`
    );
    console.log("--------------------------\n");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { feeds: unknown[] };
    expect(data.feeds).toHaveLength(FEED_COUNT);
  });
});
