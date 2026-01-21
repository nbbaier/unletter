export interface RateLimitConfig {
	limit: number;
	window: number; // seconds
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
}

export class RateLimiter {
	constructor(
		private kv: KVNamespace,
		private config: RateLimitConfig,
	) {}

	async check(key: string): Promise<RateLimitResult> {
		const now = Math.floor(Date.now() / 1000);
		const windowStart = Math.floor(now / this.config.window);
		const windowKey = `ratelimit:${key}:${windowStart}`;

		// Get current count
		const current = await this.kv.get(windowKey);
		const count = current ? Number.parseInt(current, 10) : 0;

		const resetAt = (windowStart + 1) * this.config.window;

		if (count >= this.config.limit) {
			return {
				allowed: false,
				remaining: 0,
				resetAt,
			};
		}

		// Increment counter
		await this.kv.put(windowKey, String(count + 1), {
			expirationTtl: this.config.window * 2, // Keep for 2 windows to prevent race conditions
		});

		return {
			allowed: true,
			remaining: this.config.limit - count - 1,
			resetAt,
		};
	}
}

// Helper function to extract client IP
export function getClientIP(request: Request): string {
	// Cloudflare provides the real client IP in this header
	return request.headers.get("cf-connecting-ip") || "unknown";
}

// Helper function to create rate limit response
export function rateLimitResponse(result: RateLimitResult): Response {
	const retryAfter = result.resetAt - Math.floor(Date.now() / 1000);

	return new Response(
		JSON.stringify({
			error: "Too many requests. Please try again later.",
			retryAfter,
		}),
		{
			status: 429,
			headers: {
				"content-type": "application/json",
				"retry-after": String(retryAfter),
				"x-ratelimit-limit": "5",
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset": String(result.resetAt),
				"access-control-allow-origin": "*",
			},
		},
	);
}
