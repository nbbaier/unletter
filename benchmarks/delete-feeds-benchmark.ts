function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MockKV {
  private readonly data: Map<string, string>;
  private readonly latency: number;

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

  async delete(key: string) {
    await delay(this.latency);
    this.data.delete(key);
  }
}

async function sequentialDelete(kv: MockKV, emailIds: string[]) {
  const start = performance.now();
  for (const emailId of emailIds) {
    await kv.delete(`email:${emailId}`);
  }
  const end = performance.now();
  return end - start;
}

async function parallelDelete(kv: MockKV, emailIds: string[]) {
  const start = performance.now();
  await Promise.all(emailIds.map((emailId) => kv.delete(`email:${emailId}`)));
  const end = performance.now();
  return end - start;
}

async function runBenchmark() {
  const kv = new MockKV(20); // 20ms latency
  const emailCount = 50;
  const emailIds = Array.from({ length: emailCount }, (_, i) => `id-${i}`);

  // Populate data
  console.log(`Populating ${emailCount} emails...`);
  // Use parallel put for faster setup
  await Promise.all(
    emailIds.map((emailId) => kv.put(`email:${emailId}`, "some content"))
  );

  console.log("Running sequential delete...");
  const sequentialTime = await sequentialDelete(kv, emailIds);
  console.log(`Sequential delete time: ${sequentialTime.toFixed(2)}ms`);

  // Re-populate
  console.log("Re-populating emails...");
  await Promise.all(
    emailIds.map((emailId) => kv.put(`email:${emailId}`, "some content"))
  );

  console.log("Running parallel delete...");
  const parallelTime = await parallelDelete(kv, emailIds);
  console.log(`Parallel delete time: ${parallelTime.toFixed(2)}ms`);

  const improvement = ((sequentialTime - parallelTime) / sequentialTime) * 100;
  console.log(`Performance improvement: ${improvement.toFixed(2)}%`);
}

runBenchmark().catch(console.error);
