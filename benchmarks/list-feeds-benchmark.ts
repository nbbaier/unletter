function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MockKV {
  private readonly data: Map<string, string>;
  readonly latency: number;

  constructor(latency = 50) {
    this.data = new Map();
    this.latency = latency;
  }

  async put(key: string, value: string) {
    await delay(this.latency);
    this.data.set(key, value);
  }

  async get(key: string) {
    await delay(this.latency);
    return this.data.get(key) || null;
  }
}

async function runBenchmark() {
  const kv = new MockKV(20); // 20ms latency per fetch
  const env = {
    DATA: kv,
    // biome-ignore lint/suspicious/noExplicitAny: Mocking env for benchmark
  } as any;

  // Since we can't easily mock auth module, let's create a minimal test function
  // that mirrors the logic of handleListFeeds without the auth part
  async function testHandleListFeeds(userId: string) {
    try {
      const userFeedsData = await env.DATA.get(`user:${userId}:feeds`);
      const userFeeds: (string | any)[] = userFeedsData ? JSON.parse(userFeedsData) : [];

      const feeds: any[] = [];
      let needsMigration = false;

      const feedDataList = await Promise.all(
        userFeeds.map(async (item: any) => {
          if (typeof item === "string") {
            needsMigration = true;
            const feedData = await env.DATA.get(`feed:${item}`);
            if (feedData) {
              const feed = JSON.parse(feedData);
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
        await env.DATA.put(
          `user:${userId}:feeds`,
          JSON.stringify(feeds)
        );
      }
      return feeds;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  const userId = "user123";
  const feedCount = 25; // MAX_FEEDS_PER_USER
  const feedIds = Array.from({ length: feedCount }, (_, i) => `feed-${i}`);

  // Setup user feeds with Denormalized Data (our optimization logic)
  const denormalizedFeeds = feedIds.map((id, i) => ({
    id,
    name: `Feed ${i}`,
    emailAddress: `${id}@example.com`,
    createdAt: new Date().toISOString()
  }));

  await kv.put(`user:${userId}:feeds`, JSON.stringify(denormalizedFeeds));

  // Populate actual feed data
  console.log(`Populating ${feedCount} feeds...`);
  await Promise.all(
    feedIds.map((id, i) => kv.put(`feed:${id}`, JSON.stringify({
      id,
      name: `Feed ${i}`,
      emailAddress: `${id}@example.com`,
      createdAt: new Date().toISOString(),
      userId
    })))
  );

  console.log(`Running list feeds with denormalized strategy (simulating ${kv.latency}ms latency)...`);

  const start = performance.now();
  const feeds = await testHandleListFeeds(userId);
  const end = performance.now();

  console.log(`Returned feeds: ${feeds.length}`);
  const executionTime = end - start;
  console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
