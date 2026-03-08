import alchemy from "alchemy";
import {
  Assets,
  DurableObjectNamespace,
  KVNamespace,
  Worker,
  WranglerJson,
} from "alchemy/cloudflare";
import { GitHubComment } from "alchemy/github";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("unletter", {
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const staticAssets = await Assets({ path: "./src/assets" });

const waitlistKV = await KVNamespace("waitlist", {
  title: "unletter-waitlist",
  adopt: true,
});

const dataKV = await KVNamespace("data", {
  title: "unletter-data",
  adopt: true,
});

const rateLimiterDO = DurableObjectNamespace("rate-limiter", {
  className: "RateLimiterDO",
});

export const worker = await Worker("worker", {
  name: `unletter-worker-${app.stage}`,
  entrypoint: "src/worker.ts",
  compatibilityDate: "2026-02-13",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    ASSETS: staticAssets,
    WAITLIST: waitlistKV,
    DATA: dataKV,
    RATE_LIMITER: rateLimiterDO,
    ADMIN_API_KEY: alchemy.secret(
      process.env.ADMIN_API_KEY || "change-me-in-production"
    ),
    WEBHOOK_SECRET: alchemy.secret(
      process.env.WEBHOOK_SECRET || "change-me-in-production"
    ),
    JWT_SECRET: alchemy.secret(
      process.env.JWT_SECRET || "change-me-in-production"
    ),
    APP_BASE_URL: process.env.APP_BASE_URL || "https://unletter.app",
    INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN || "unletter.app",
    TURNSTILE_SECRET: alchemy.secret(process.env.TURNSTILE_SECRET || ""),
  },
  domains: process.env.PULL_REQUEST
    ? undefined
    : [{ domainName: "unletter.app", adopt: true }],
  adopt: true,
});

await WranglerJson({ worker });

console.log(worker.url);

if (process.env.PULL_REQUEST) {
  const previewUrl = worker.url;

  await GitHubComment("pr-preview-comment", {
    owner: process.env.GITHUB_REPOSITORY_OWNER || "your-username",
    repository: process.env.GITHUB_REPOSITORY_NAME || "unletter",
    issueNumber: Number(process.env.PULL_REQUEST),
    body: `
## 🚀 Preview Deployed

Your preview is ready!

**Preview URL:** ${previewUrl}

This preview was built from commit ${process.env.GITHUB_SHA}

---
<sub>🤖 This comment will be updated automatically when you push new commits to this PR.</sub>`,
  });
}

await app.finalize();
