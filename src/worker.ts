import type { worker } from "../alchemy.run.ts";

export default {
	async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
		return env.ASSETS.fetch(request);
	},
};
