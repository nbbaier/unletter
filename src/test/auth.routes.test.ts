import { beforeEach, describe, expect, it } from "vitest";
import {
	authenticateRequest,
	handleLogin,
	handleSignup,
} from "../routes/auth.ts";
import { createMockEnv } from "./utils.ts";

function createMockRequest(
	method: string,
	body?: unknown,
	headers?: Record<string, string>,
): Request {
	return new Request("http://localhost/api/auth/signup", {
		method,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe("handleSignup", () => {
	it("should create a new user with valid credentials", async () => {
		const env = createMockEnv();
		const request = createMockRequest("POST", {
			email: "newuser@example.com",
			password: "securepassword123",
		});

		const response = await handleSignup(request, env);

		expect(response.status).toBe(201);
		const data = await response.json();
		expect(data.user.id).toBeTruthy();
		expect(data.user.email).toBe("newuser@example.com");
		expect(data.token).toBeTruthy();
	});

	it("should reject signup with invalid email", async () => {
		const env = createMockEnv();
		const request = createMockRequest("POST", {
			email: "not-an-email",
			password: "securepassword123",
		});

		const response = await handleSignup(request, env);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain("Invalid email");
	});

	it("should reject signup with short password", async () => {
		const env = createMockEnv();
		const request = createMockRequest("POST", {
			email: "user@example.com",
			password: "short",
		});

		const response = await handleSignup(request, env);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain("at least 8 characters");
	});

	it("should reject duplicate email signup", async () => {
		const env = createMockEnv();
		const email = "duplicate@example.com";

		// First signup
		const request1 = createMockRequest("POST", {
			email,
			password: "password123",
		});
		await handleSignup(request1, env);

		// Second signup with same email
		const request2 = createMockRequest("POST", {
			email,
			password: "password456",
		});
		const response = await handleSignup(request2, env);

		expect(response.status).toBe(409);
		const data = await response.json();
		expect(data.error).toContain("already registered");
	});
});

describe("handleLogin", () => {
	it("should login with correct credentials", async () => {
		const env = createMockEnv();
		const email = "loginuser@example.com";
		const password = "password123";

		// Create user first
		const signupRequest = createMockRequest("POST", { email, password });
		await handleSignup(signupRequest, env);

		const loginRequest = createMockRequest("POST", { email, password });
		const response = await handleLogin(loginRequest, env);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.token).toBeTruthy();
		expect(data.user.id).toBeTruthy();
	});

	it("should reject login with wrong password", async () => {
		const env = createMockEnv();
		const email = "loginuser2@example.com";
		const password = "password123";

		// Create user first
		const signupRequest = createMockRequest("POST", { email, password });
		await handleSignup(signupRequest, env);

		const loginRequest = createMockRequest("POST", {
			email,
			password: "wrongpassword",
		});
		const response = await handleLogin(loginRequest, env);

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data.error).toContain("Invalid credentials");
	});

	it("should reject login for non-existent user", async () => {
		const env = createMockEnv();
		const loginRequest = createMockRequest("POST", {
			email: "nonexistent@example.com",
			password: "password123",
		});

		const response = await handleLogin(loginRequest, env);

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data.error).toContain("Invalid credentials");
	});
});

describe("authenticateRequest", () => {
	it("should authenticate valid token", async () => {
		const env = createMockEnv();
		const email = "authuser@example.com";
		const password = "password123";

		// Create user and get token
		const signupRequest = createMockRequest("POST", { email, password });
		const signupResponse = await handleSignup(signupRequest, env);
		const { token } = await signupResponse.json();

		const authRequest = new Request("http://localhost/api/feeds", {
			headers: { Authorization: `Bearer ${token}` },
		});

		const result = await authenticateRequest(authRequest, env);

		expect(result).not.toBeInstanceOf(Response);
		if (!(result instanceof Response)) {
			expect(result.userId).toBeTruthy();
		}
	});

	it("should reject missing authorization header", async () => {
		const env = createMockEnv();
		const request = new Request("http://localhost/api/feeds");

		const result = await authenticateRequest(request, env);

		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const data = await result.json();
			expect(data.error).toContain("Authorization required");
		}
	});

	it("should reject invalid token", async () => {
		const env = createMockEnv();
		const request = new Request("http://localhost/api/feeds", {
			headers: { Authorization: "Bearer invalid-token" },
		});

		const result = await authenticateRequest(request, env);

		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const data = await result.json();
			expect(data.error).toContain("Invalid or expired token");
		}
	});
});
