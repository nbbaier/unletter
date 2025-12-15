import alchemy from "alchemy";
import { Assets, KVNamespace, Worker, WranglerJson } from "alchemy/cloudflare";
import { GitHubComment } from "alchemy/github";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("unletter", {
	stateStore: (scope) => new CloudflareStateStore(scope),
});

const staticAssets = await Assets({
	path: "./src/assets",
});

const waitlistKV = await KVNamespace("waitlist", {
	title: "unletter-waitlist",
});

const dataKV = await KVNamespace("data", {
	title: "unletter-data",
});

export const worker = await Worker("worker", {
	entrypoint: "src/worker.ts",
	bindings: {
		ASSETS: staticAssets,
		WAITLIST: waitlistKV,
		DATA: dataKV,
		ADMIN_API_KEY: alchemy.secret(
			process.env.ADMIN_API_KEY || "change-me-in-production",
		),
		WEBHOOK_SECRET: alchemy.secret(
			process.env.WEBHOOK_SECRET || "change-me-in-production",
		),
		JWT_SECRET: alchemy.secret(
			process.env.JWT_SECRET || "change-me-in-production",
		),
	},
	domains: ["unletter.app"],
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
