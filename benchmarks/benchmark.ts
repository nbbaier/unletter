// Run with: bun benchmarks/benchmark.ts
import { handleGetFeed } from "../src/routes/feeds.ts";

// Mock KVNamespace
class MockKV {
	store = new Map<string, string>();
	delay: number;

	constructor(delay = 10) {
		this.delay = delay; // Simulate network latency
	}

	async get(key: string): Promise<string | null> {
		// Simulate network delay
		if (this.delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.delay));
		}
		return this.store.get(key) || null;
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
	}
}

async function runBenchmark() {
	const mockData = new MockKV(20); // 20ms delay per fetch
	const env = {
		DATA: mockData,
		// biome-ignore lint/suspicious/noExplicitAny: Mocking env for benchmark
	} as any;

	const feedId = "feed123";
	const feed = {
		id: feedId,
		userId: "user123",
		name: "Test Feed",
		emailAddress: "test@example.com",
		createdAt: new Date().toISOString(),
	};

	await mockData.put(`feed:${feedId}`, JSON.stringify(feed));

	const emailIds = [];
	const numEmails = 50;
	for (let i = 0; i < numEmails; i++) {
		const emailId = `email${i}`;
		emailIds.push(emailId);
		const email = {
			id: emailId,
			feedId: feedId,
			subject: `Subject ${i}`,
			from: { name: "Sender", email: "sender@example.com" },
			html: "<p>Content</p>",
			text: "Content",
			timestamp: new Date().toISOString(),
		};
		await mockData.put(`email:${emailId}`, JSON.stringify(email));
	}

	// handleGetFeed limits to 50 emails, so we test with 50.
	await mockData.put(`feed:${feedId}:emails`, JSON.stringify(emailIds));

	console.log(
		`Starting benchmark with ${numEmails} emails and ${mockData.delay}ms latency...`,
	);

	// Warmup
	// await handleGetFeed(env, feedId, "rss");

	const start = performance.now();
	await handleGetFeed(env, feedId, "rss");
	const end = performance.now();
	console.log(`Time taken: ${(end - start).toFixed(2)}ms`);
}

runBenchmark();
