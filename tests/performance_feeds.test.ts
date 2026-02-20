import { describe, expect, mock, test } from "bun:test";
import { handleListFeeds } from "../src/routes/feeds";

// Mock authenticateRequest
mock.module("../src/routes/auth", () => ({
  authenticateRequest: async () => ({ userId: "test-user" }),
}));

// Mock user feeds and feed data
const USER_ID = "test-user";
const FEED_COUNT = 50;
const DELAY_MS = 10;

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
  DATA: {
    get: async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      return mockData.get(key) || null;
    },
    // biome-ignore lint/suspicious/noExplicitAny: Mocking environment
  } as any,
  // biome-ignore lint/suspicious/noExplicitAny: Mocking environment
} as any;

describe("Performance Baseline", () => {
  test("measure handleListFeeds performance", async () => {
    const start = performance.now();
    const response = await handleListFeeds(
      new Request("http://localhost/feeds"),
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
    const data = await response.json();
    // biome-ignore lint/suspicious/noExplicitAny: Response body is any
    expect((data as any).feeds).toHaveLength(FEED_COUNT);
  });
});
