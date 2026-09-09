import { handleAdminList } from "../src/routes/waitlist";

// Mock environment
const mockEnv = {
  ADMIN_API_KEY: "test-key",
  WAITLIST: {
    get: async (key: string) => {
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 10));
      return JSON.stringify({
        email: key,
        referrer: "benchmark",
        timestamp: new Date().toISOString(),
        userAgent: "benchmark-agent",
      });
    },
    list: async () => ({
      keys: Array.from({ length: 100 }, (_, i) => ({
        metadata: {
          email: `user${i}@example.com`,
          referrer: "benchmark",
          timestamp: new Date().toISOString(),
          userAgent: "benchmark-agent",
        },
        name: `user${i}@example.com`,
      })),
      list_complete: true,
    }),
  },
};

// Benchmark function
async function runBenchmark() {
  console.log("Starting benchmark...");
  const start = performance.now();

  const request = new Request("http://localhost/admin/waitlist", {
    headers: {
      Authorization: "Bearer test-key",
    },
    method: "GET",
  });

  // @ts-expect-error
  await handleAdminList(request, mockEnv);

  const end = performance.now();
  console.log(`Benchmark completed in ${(end - start).toFixed(2)}ms`);
  process.exit(0);
}

runBenchmark();
