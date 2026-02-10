import type { RateLimitConfig, RateLimitResult } from "../lib/rate-limit.ts";

export class RateLimiterDO implements DurableObject {
	constructor(
		private state: DurableObjectState,
		_env: Env,
	) {}

	async fetch(request: Request): Promise<Response> {
		const config: RateLimitConfig = await request.json();

		const now = Math.floor(Date.now() / 1000);
		const windowStart = Math.floor(now / config.window);
		const storageKey = `count:${windowStart}`;

		let result: RateLimitResult | undefined;

		// Use a transaction to ensure atomic read-modify-write
		await this.state.storage.transaction(async (txn) => {
			const current = (await txn.get<number>(storageKey)) || 0;
			const resetAt = (windowStart + 1) * config.window;

			if (current >= config.limit) {
				result = {
					allowed: false,
					remaining: 0,
					resetAt,
					limit: config.limit,
				};
				return;
			}

			await txn.put(storageKey, current + 1);

			result = {
				allowed: true,
				remaining: config.limit - current - 1,
				resetAt,
				limit: config.limit,
			};
		});

		// Manage alarm for cleanup (outside transaction as it might not be supported on txn object)
		// We want to keep data until the window is fully passed.
		// Adding a buffer (2x window) ensures we don't delete prematurely.
		const deleteAt = (now + config.window * 2) * 1000;
		const currentAlarm = await this.state.storage.getAlarm();

		if (currentAlarm === null || currentAlarm < deleteAt) {
			await this.state.storage.setAlarm(deleteAt);
		}

		if (!result) {
			return new Response("Internal Server Error", { status: 500 });
		}

		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async alarm() {
		await this.state.storage.deleteAll();
	}
}
