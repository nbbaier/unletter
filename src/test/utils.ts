import type {
  DurableObjectNamespace,
  DurableObjectStub,
  KVNamespace,
} from "@cloudflare/workers-types";

export interface MockEnv {
  ADMIN_API_KEY: string;
  APP_BASE_URL: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DATA: KVNamespace;
  INBOUND_EMAIL_DOMAIN: string;
  JWT_SECRET: string;
  RATE_LIMITER: DurableObjectNamespace;
  TURNSTILE_SECRET: string;
  WAITLIST: KVNamespace;
  WEBHOOK_SECRET: string;
}

export function createMockEnv(): MockEnv {
  const dataStore = new Map<string, string>();
  const waitlistStore = new Map<string, string>();

  const createKVNamespace = (store: Map<string, string>): KVNamespace =>
    ({
      get: (key: string) => Promise.resolve(store.get(key) || null),
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      list: () => {
        const keys = Array.from(store.keys()).map((name) => ({ name }));
        return Promise.resolve({ keys, list_complete: true, cursor: "" });
      },
      getWithMetadata: () => Promise.resolve({ value: null, metadata: null }),
    }) as unknown as KVNamespace;

  const rateLimiterStub = {
    fetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            remaining: 100,
            limit: 100,
            resetAt: Math.floor(Date.now() / 1000) + 60,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      ),
  } as unknown as DurableObjectStub;

  const rateLimiterNamespace = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => rateLimiterStub,
  } as unknown as DurableObjectNamespace;

  return {
    DATA: createKVNamespace(dataStore),
    WAITLIST: createKVNamespace(waitlistStore),
    RATE_LIMITER: rateLimiterNamespace,
    JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests-only",
    ADMIN_API_KEY: "test-admin-api-key",
    WEBHOOK_SECRET: "test-webhook-secret",
    APP_BASE_URL: "https://unletter.test",
    INBOUND_EMAIL_DOMAIN: "unletter.app",
    TURNSTILE_SECRET: "",
    ASSETS: {
      fetch: async () =>
        new Response("Not Found", {
          status: 404,
        }),
    },
  };
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
