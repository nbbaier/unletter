export interface RateLimitConfig {
  limit: number;
  window: number; // seconds
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * @deprecated Use DurableRateLimiter instead for strict rate limiting.
 */
export class RateLimiter {
  constructor(
    private kv: KVNamespace,
    private config: RateLimitConfig
  ) {}

  /**
   * Check if a request is allowed under the rate limit.
   *
   * NOTE: This implementation has a known race condition between reading
   * the current count and incrementing it. Two simultaneous requests could
   * both read the same count and both be allowed, potentially exceeding
   * the limit by a small amount during bursts. This is an acceptable
   * trade-off for simplicity, as Cloudflare KV does not support atomic
   * increment operations. For stricter rate limiting, consider using
   * Durable Objects or an external rate limiting service.
   */
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
        limit: this.config.limit,
      };
    }

    // Increment counter
    await this.kv.put(windowKey, String(count + 1), {
      expirationTtl: this.config.window * 2, // Keep for 2 windows to handle edge cases
    });

    return {
      allowed: true,
      remaining: this.config.limit - count - 1,
      resetAt,
      limit: this.config.limit,
    };
  }
}

export class DurableRateLimiter {
  constructor(
    private namespace: DurableObjectNamespace,
    private config: RateLimitConfig
  ) {}

  /**
   * Check if a request is allowed under the rate limit using Durable Objects.
   * This implementation is atomic and strictly enforces the limit.
   * Fails open (allows request) if the DO is unavailable to avoid taking down endpoints.
   */
  async check(key: string): Promise<RateLimitResult> {
    try {
      const id = this.namespace.idFromName(key);
      const stub = this.namespace.get(id);

      const response = await stub.fetch(`http://rate-limiter/${key}`, {
        method: "POST",
        body: JSON.stringify(this.config),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.error(
          `Rate limit DO returned ${response.status}: ${response.statusText}`
        );
        return this.failOpen();
      }

      return (await response.json()) as RateLimitResult;
    } catch (error) {
      console.error("Rate limit check failed, failing open:", error);
      return this.failOpen();
    }
  }

  private failOpen(): RateLimitResult {
    return {
      allowed: true,
      remaining: this.config.limit,
      resetAt: Math.floor(Date.now() / 1000) + this.config.window,
      limit: this.config.limit,
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
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": String(result.remaining),
        "x-ratelimit-reset": String(result.resetAt),
        "access-control-allow-origin": "*",
      },
    }
  );
}
