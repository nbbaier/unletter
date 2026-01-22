import { nanoid } from "nanoid";
import { z } from "zod";
import type { worker } from "../../alchemy.run.ts";
import {
	createToken,
	hashPassword,
	verifyPassword,
	verifyToken,
} from "../lib/auth.ts";
import {
	getClientIP,
	RateLimiter,
	rateLimitResponse,
} from "../lib/rate-limit.ts";
import { jsonResponse } from "../lib/response.ts";
import { getFirstError, LoginSchema, SignupSchema } from "../lib/schemas.ts";
import type { User } from "../types.ts";

export async function handleSignup(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	// Rate limiting: 3 signups per hour per IP
	const clientIP = getClientIP(request);
	const signupLimiter = new RateLimiter(env.DATA, { limit: 3, window: 3600 });
	const rateLimitResult = await signupLimiter.check(`signup:${clientIP}`);

	if (!rateLimitResult.allowed) {
		return rateLimitResponse(rateLimitResult);
	}

	try {
		const body = await request.json();
		const { email, password } = SignupSchema.parse(body);

		// Check if user already exists
		const existingUserId = await env.DATA.get(`user:email:${email}`);
		if (existingUserId) {
			return jsonResponse({ error: "Email already registered" }, 409);
		}

		// Create user
		const userId = nanoid();
		const passwordHash = await hashPassword(password);

		const user: User = {
			id: userId,
			email,
			passwordHash,
			createdAt: new Date().toISOString(),
		};

		// Store user and email index
		await env.DATA.put(`user:${userId}`, JSON.stringify(user));
		await env.DATA.put(`user:email:${email}`, userId);
		await env.DATA.put(`user:${userId}:feeds`, JSON.stringify([]));

		// Create JWT
		const token = await createToken(userId, env.JWT_SECRET);

		return jsonResponse(
			{
				token,
				user: {
					id: userId,
					email,
				},
			},
			201,
		);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return jsonResponse({ error: getFirstError(error) }, 400);
		}
		console.error("Signup error:", error);
		return jsonResponse({ error: "Failed to create account" }, 500);
	}
}

export async function handleLogin(
	request: Request,
	env: typeof worker.Env,
): Promise<Response> {
	// Rate limiting: 5 login attempts per minute per IP
	const clientIP = getClientIP(request);
	const loginLimiter = new RateLimiter(env.DATA, { limit: 5, window: 60 });
	const rateLimitResult = await loginLimiter.check(`login:${clientIP}`);

	if (!rateLimitResult.allowed) {
		return rateLimitResponse(rateLimitResult);
	}

	try {
		const body = await request.json();
		const { email, password } = LoginSchema.parse(body);

		// Look up user by email
		const userId = await env.DATA.get(`user:email:${email}`);
		if (!userId) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		const userData = await env.DATA.get(`user:${userId}`);
		if (!userData) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		const user: User = JSON.parse(userData);

		// Verify password
		const isValid = await verifyPassword(password, user.passwordHash);
		if (!isValid) {
			return jsonResponse({ error: "Invalid credentials" }, 401);
		}

		// Create JWT
		const token = await createToken(userId, env.JWT_SECRET);

		return jsonResponse({
			token,
			user: {
				id: userId,
				email: user.email,
			},
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return jsonResponse({ error: getFirstError(error) }, 400);
		}
		console.error("Login error:", error);
		return jsonResponse({ error: "Failed to log in" }, 500);
	}
}

// Auth middleware helper
export async function authenticateRequest(
	request: Request,
	env: typeof worker.Env,
): Promise<{ userId: string } | Response> {
	const authHeader = request.headers.get("authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return jsonResponse({ error: "Authorization required" }, 401);
	}

	const token = authHeader.slice(7);
	const result = await verifyToken(token, env.JWT_SECRET);

	if (!result) {
		return jsonResponse({ error: "Invalid or expired token" }, 401);
	}

	return { userId: result.userId };
}
