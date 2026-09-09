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
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      get: (key: string) => Promise.resolve(store.get(key) || null),
      getWithMetadata: () => Promise.resolve({ metadata: null, value: null }),
      list: () => {
        const keys = Array.from(store.keys()).map((name) => ({ name }));
        return Promise.resolve({ cursor: "", keys, list_complete: true });
      },
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    }) as unknown as KVNamespace;

  const rateLimiterStub = {
    fetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: true,
            limit: 100,
            remaining: 100,
            resetAt: Math.floor(Date.now() / 1000) + 60,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          }
        )
      ),
  } as unknown as DurableObjectStub;

  const rateLimiterNamespace = {
    get: () => rateLimiterStub,
    idFromName: (name: string) => ({ toString: () => name }),
  } as unknown as DurableObjectNamespace;

  return {
    ADMIN_API_KEY: "test-admin-api-key",
    APP_BASE_URL: "https://unletter.test",
    ASSETS: {
      fetch: async () =>
        new Response("Not Found", {
          status: 404,
        }),
    },
    DATA: createKVNamespace(dataStore),
    INBOUND_EMAIL_DOMAIN: "unletter.app",
    JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests-only",
    RATE_LIMITER: rateLimiterNamespace,
    TURNSTILE_SECRET: "",
    WAITLIST: createKVNamespace(waitlistStore),
    WEBHOOK_SECRET: "test-webhook-secret",
  };
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
