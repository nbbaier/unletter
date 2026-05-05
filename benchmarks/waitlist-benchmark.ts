import { handleAdminList } from "../src/routes/waitlist";

// Mock environment
const mockEnv = {
  WAITLIST: {
    list: async () => ({
      keys: Array.from({ length: 100 }, (_, i) => ({
        name: `user${i}@example.com`,
        metadata: {
          email: `user${i}@example.com`,
          timestamp: new Date().toISOString(),
          userAgent: "benchmark-agent",
          referrer: "benchmark",
        },
      })),
      list_complete: true,
    }),
    get: async (key: string) => {
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 10));
      return JSON.stringify({
        email: key,
        timestamp: new Date().toISOString(),
        userAgent: "benchmark-agent",
        referrer: "benchmark",
      });
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
  process.exit(0);
}

runBenchmark();
