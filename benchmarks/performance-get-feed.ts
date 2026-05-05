import { handleGetFeed } from "../src/routes/feeds.ts";

const FEED_ID = "test-feed";
const EMAIL_COUNT = 50;
const DELAY_MS = 10;
const mockData = new Map<string, string>();

// Populate data
mockData.set(
  `feed:${FEED_ID}`,
  JSON.stringify({
    id: FEED_ID,
    name: "Test Feed",
    emailAddress: "test@example.com",
    createdAt: new Date().toISOString(),
  })
);

const emailIds: string[] = [];
for (let i = 0; i < EMAIL_COUNT; i++) {
  const emailId = `email-${i}`;
  emailIds.push(emailId);
  mockData.set(
    `email:${emailId}`,
    JSON.stringify({
      id: emailId,
      feedId: FEED_ID,
      subject: `Test Email ${i}`,
      text: "Test content",
      html: "<p>Test content</p>",
      timestamp: new Date().toISOString(),
      from: { name: "Tester", email: "tester@example.com" },
    })
  );
}
mockData.set(`feed:${FEED_ID}:emails`, JSON.stringify(emailIds));

const mockEnv = {
  APP_BASE_URL: "http://localhost",
  DATA: {
    get: async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      return mockData.get(key) || null;
    },
    // biome-ignore lint/suspicious/useAwait: mock for benchmark
    put: async (key: string, value: string) => {
      mockData.set(key, value);
    },
  },
} as unknown as Parameters<typeof handleGetFeed>[1];

async function runBenchmark() {
  // First run: cold cache, everything is string IDs (baseline / lazy migrate)
  const start1 = performance.now();
  const response1 = await handleGetFeed(
    new Request(`http://localhost/feeds/${FEED_ID}`),
    mockEnv,
    FEED_ID,
    "rss"
  );
  const end1 = performance.now();
  const duration1 = end1 - start1;

  if (response1.status !== 200) {
    throw new Error(`Expected status 200 on run 1, got ${response1.status}`);
  }

  // Second run: everything is migrated to denormalized list!
  const start2 = performance.now();
  const response2 = await handleGetFeed(
    new Request(`http://localhost/feeds/${FEED_ID}`),
    mockEnv,
    FEED_ID,
    "rss"
  );
  const end2 = performance.now();
  const duration2 = end2 - start2;

  if (response2.status !== 200) {
    throw new Error(`Expected status 200 on run 2, got ${response2.status}`);
  }

  console.log("\n\n--- Performance Result ---");
  console.log(
    `Baseline (fetching ${EMAIL_COUNT} legacy string IDs + Migration): ${duration1.toFixed(2)}ms`
  );
  console.log(
    `Optimized (fetching denormalized list): ${duration2.toFixed(2)}ms`
  );
  console.log("--------------------------\n");
}

runBenchmark().catch(console.error);
