import type { worker } from "../alchemy.run.ts";
import { handleInboundWebhook } from "../src/routes/webhook.ts";


const mockEnv = {
	WEBHOOK_SECRET: "secret",
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
};

const payload = {
	event: "inbound",
	timestamp: new Date().toISOString(),
	email: {
		id: "new-email-id",
		from: {
			text: "Sender <sender@example.com>",
			addresses: [{ address: "sender@example.com", name: "Sender" }],
		},
		to: {
			text: "test-feed-id@unletter.app",
			addresses: [{ address: "test-feed-id@unletter.app" }],
		},
		recipient: "test-feed-id@unletter.app",
		subject: "Test Subject",
		receivedAt: new Date().toISOString(),
		parsedData: {
			textBody: "Hello",
			htmlBody: "<p>Hello</p>",
		},
	},
};

const mockRequest = () =>
	new Request("http://localhost/api/webhook/inbound", {
		method: "POST",
		headers: {
			"x-webhook-verification-token": "secret",
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	});

async function runBenchmark() {
	console.log("Starting benchmark...");
	const iterations = 5;
	let totalTime = 0;

	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await handleInboundWebhook(
			mockRequest(),
			mockEnv as unknown as typeof worker.Env,
		);
		const end = performance.now();
		const duration = end - start;
		console.log(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
		totalTime += duration;
	}

	console.log(`Average time: ${(totalTime / iterations).toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
