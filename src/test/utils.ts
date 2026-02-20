import type { KVNamespace } from "@cloudflare/workers-types";

export interface MockEnv {
  ADMIN_API_KEY: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  DATA: KVNamespace;
  JWT_SECRET: string;
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

  return {
    DATA: createKVNamespace(dataStore),
    WAITLIST: createKVNamespace(waitlistStore),
    JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests-only",
    ADMIN_API_KEY: "test-admin-api-key",
    WEBHOOK_SECRET: "test-webhook-secret",
    ASSETS: {
      fetch: async () =>
        new Response("Not Found", {
          status: 404,
        }),
    },
  };
}

export async function createTestUser(
  _env: MockEnv,
  email: string,
  password: string
): Promise<{ userId: string; token: string }> {
  // Create user via signup
  const signupResponse = await fetch("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!signupResponse.ok) {
    throw new Error(
      `Failed to create test user: ${await signupResponse.text()}`
    );
  }

  const signupData = (await signupResponse.json()) as {
    userId: string;
    email: string;
  };

  // Login to get token
  const loginResponse = await fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResponse.ok) {
    throw new Error(`Failed to login test user: ${await loginResponse.text()}`);
  }

  const loginData = (await loginResponse.json()) as {
    token: string;
    userId: string;
  };

  return {
    userId: signupData.userId,
    token: loginData.token,
  };
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
