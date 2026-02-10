import { beforeEach, describe, expect, it } from "vitest";
import {
	createToken,
	hashPassword,
	verifyPassword,
	verifyToken,
} from "../lib/auth.ts";
import { createMockEnv } from "./utils.ts";

describe("auth", () => {
	describe("hashPassword", () => {
		it("should hash a password and return salt:hash format", async () => {
			const password = "testpassword123";
			const hash = await hashPassword(password);

			expect(hash).toContain(":");
			const [salt, hashedValue] = hash.split(":");
			expect(salt).toBeTruthy();
			expect(hashedValue).toBeTruthy();
			expect(salt.length).toBeGreaterThan(0);
			expect(hashedValue.length).toBeGreaterThan(0);
		});

		it("should produce different hashes for same password (due to salt)", async () => {
			const password = "testpassword123";
			const hash1 = await hashPassword(password);
			const hash2 = await hashPassword(password);

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("verifyPassword", () => {
		it("should return true for correct password", async () => {
			const password = "testpassword123";
			const hash = await hashPassword(password);
			const isValid = await verifyPassword(password, hash);

			expect(isValid).toBe(true);
		});

		it("should return false for incorrect password", async () => {
			const password = "testpassword123";
			const wrongPassword = "wrongpassword456";
			const hash = await hashPassword(password);
			const isValid = await verifyPassword(wrongPassword, hash);

			expect(isValid).toBe(false);
		});

		it("should return false for malformed hash", async () => {
			const isValid = await verifyPassword("password", "malformedhash");
			expect(isValid).toBe(false);
		});

		it("should return false for empty hash", async () => {
			const isValid = await verifyPassword("password", "");
			expect(isValid).toBe(false);
		});
	});

	describe("createToken", () => {
		it("should create a valid JWT token", async () => {
			const userId = "user-123";
			const secret = "test-secret";
			const token = await createToken(userId, secret);

			expect(token).toBeTruthy();
			expect(token.split(".").length).toBe(3); // header.payload.signature
		});

		it("should create unique tokens for different users", async () => {
			const secret = "test-secret";
			const token1 = await createToken("user-1", secret);
			const token2 = await createToken("user-2", secret);

			expect(token1).not.toBe(token2);
		});
	});

	describe("verifyToken", () => {
		it("should verify a valid token", async () => {
			const userId = "user-123";
			const secret = "test-secret";
			const token = await createToken(userId, secret);
			const result = await verifyToken(token, secret);

			expect(result).not.toBeNull();
			expect(result?.userId).toBe(userId);
		});

		it("should return null for invalid token", async () => {
			const result = await verifyToken("invalid.token.here", "secret");
			expect(result).toBeNull();
		});

		it("should return null for token with wrong secret", async () => {
			const userId = "user-123";
			const token = await createToken(userId, "correct-secret");
			const result = await verifyToken(token, "wrong-secret");

			expect(result).toBeNull();
		});

		it("should return null for malformed token", async () => {
			const result = await verifyToken("not-a-jwt", "secret");
			expect(result).toBeNull();
		});
	});
});
