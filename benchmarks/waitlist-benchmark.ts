import { handleAdminList } from "../src/routes/waitlist.ts";

// Mock environment
let getCount = 0;
const mockEnv = {
  WAITLIST: {
    list: async (options?: { cursor?: string }) => ({
      keys: Array.from({ length: 100 }, (_, i) => {
        // All of them have metadata now for the benchmark measuring fully populated state
        return {
          name: `user${i}@example.com`,
          metadata: {
            email: `user${i}@example.com`,
            timestamp: new Date().toISOString(),
            userAgent: "benchmark-agent",
            referrer: "benchmark",
          },
        };
      }),
      list_complete: true,
    }),
    get: async (key: string) => {
      getCount++;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 10));
      return JSON.stringify({
        email: key,
        timestamp: new Date().toISOString(),
        userAgent: "benchmark-agent",
        referrer: "benchmark",
      });
    },
    put: async (_key: string, _value: string, _options?: unknown) => {
      // simulate put
    },
  },
  ADMIN_API_KEY: "test-key",
};

// Benchmark function
async function runBenchmark() {
  console.log("Starting benchmark...");
  const start = performance.now();

  const request = new Request("http://localhost/admin/waitlist", {
    method: "GET",
    headers: {
      Authorization: "Bearer test-key",
    },
  });

  // @ts-expect-error
  await handleAdminList(request, mockEnv);

  const end = performance.now();
  console.log(`Benchmark completed in ${(end - start).toFixed(2)}ms`);
  console.log(`KV GET calls: ${getCount}`);
}

runBenchmark();
