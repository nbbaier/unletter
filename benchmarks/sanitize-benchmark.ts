
import { sanitizeHtml } from "../src/lib/sanitize.ts";

function runBenchmark() {
  const htmlWithManyAttributes = `
    <div
      attr1="value1"
      attr2='value2'
      attr3=value3
      attr4="value4"
      attr5='value5'
      attr6=value6
      attr7="value7"
      attr8='value8'
      attr9=value9
      attr10="value10"
      class="some-class"
      id="some-id"
      title="some-title"
      lang="en"
      dir="ltr"
    ></div>`.repeat(1000);

  console.log("Starting benchmark for sanitizeHtml...");

  // Warmup
  for (let i = 0; i < 10; i++) {
    sanitizeHtml(htmlWithManyAttributes);
  }

  const iterations = 100;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    sanitizeHtml(htmlWithManyAttributes);
  }
  const end = performance.now();

  console.log(`Total time for ${iterations} iterations: ${(end - start).toFixed(2)}ms`);
  console.log(`Average time per iteration: ${((end - start) / iterations).toFixed(2)}ms`);
}

runBenchmark();
