import type { RateLimitConfig, RateLimitResult } from "../lib/rate-limit.ts";

// Allowed rate limit configurations (server-side validation)
const ALLOWED_CONFIGS: Record<string, { limit: number; window: number }> = {
  "3:3600": { limit: 3, window: 3600 }, // signup: 3/hour
  "5:60": { limit: 5, window: 60 }, // login: 5/minute
  "5:3600": { limit: 5, window: 3600 }, // waitlist: 5/hour
};

function validateConfig(config: RateLimitConfig): RateLimitConfig {
  const key = `${config.limit}:${config.window}`;
  const allowed = ALLOWED_CONFIGS[key];
  if (!allowed) {
    throw new Error(`Invalid rate limit config: ${key}`);
  }
  return allowed;
}

export class RateLimiterDO implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const rawConfig: RateLimitConfig = await request.json();
    const config = validateConfig(rawConfig);

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

    return Response.json(result);
  }

  async alarm() {
    // Only delete expired window keys, not the entire storage
    const now = Math.floor(Date.now() / 1000);
    const entries = await this.state.storage.list<number>();
    const keysToDelete: string[] = [];

    for (const [key] of entries) {
      if (!key.startsWith("count:")) {
        continue;
      }
      const windowStart = Number.parseInt(key.split(":")[1], 10);
      // Delete windows that ended more than one window ago (conservative)
      // We don't know the exact window size, but if the alarm fires,
      // the window that scheduled it is at least 2x past
      if (windowStart < now / 60) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      await this.state.storage.delete(keysToDelete);
    }
  }
}
