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
for (let i = 0; i < FEED_COUNT; i += 1) {
  const feedId = `feed-${i}`;
  feedIds.push(feedId);
  mockData.set(
    `feed:${feedId}`,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      emailAddress: `feed${i}@example.com`,
      id: feedId,
      name: `Feed ${i}`,
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
  },
  JWT_SECRET,
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
