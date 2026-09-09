// Run with: bun benchmarks/webhook_perf.ts
import type { worker } from "../alchemy.run.ts";
import { handleInboundWebhook } from "../src/routes/webhook.ts";

const mockEnv = {
  DATA: {
    get: async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms latency for all gets
      if (key === "feed:test-feed-id") {
        return JSON.stringify({ id: "test-feed-id", name: "Test Feed" });
      }
      if (key.startsWith("feed:") && key.endsWith(":emails")) {
        return JSON.stringify(["old-email-id"]);
      }
      return null;
    },
    put: async (_key: string, _value: string) => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms latency for all puts
    },
  },
  WEBHOOK_SECRET: "secret",
};

const payload = {
  email: {
    from: {
      addresses: [{ address: "sender@example.com", name: "Sender" }],
      text: "Sender <sender@example.com>",
    },
    id: "new-email-id",
    parsedData: {
      htmlBody: "<p>Hello</p>",
      textBody: "Hello",
    },
    receivedAt: new Date().toISOString(),
    recipient: "test-feed-id@unletter.app",
    subject: "Test Subject",
    to: {
      addresses: [{ address: "test-feed-id@unletter.app" }],
      text: "test-feed-id@unletter.app",
    },
  },
  event: "inbound",
  timestamp: new Date().toISOString(),
};

const mockRequest = () =>
  new Request("http://localhost/api/webhook/inbound", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-webhook-verification-token": "secret",
    },
    method: "POST",
  });

async function runBenchmark() {
  console.log("Starting benchmark...");
  const iterations = 5;
  let totalTime = 0;

  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: sequential timing per iteration is intentional
    await handleInboundWebhook(
      mockRequest(),
      mockEnv as unknown as typeof worker.Env
    );
    const end = performance.now();
    const duration = end - start;
    console.log(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    totalTime += duration;
  }

  console.log(`Average time: ${(totalTime / iterations).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
