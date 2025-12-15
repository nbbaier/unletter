const ITERATIONS = 100000;
const HASH_ALGORITHM = "SHA-256";
const SALT_LENGTH = 16;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const hash = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt,
			iterations: ITERATIONS,
			hash: HASH_ALGORITHM,
		},
		keyMaterial,
		256,
	);

	const saltBase64 = arrayBufferToBase64(salt.buffer);
	const hashBase64 = arrayBufferToBase64(hash);

	return `${saltBase64}:${hashBase64}`;
}

export async function verifyPassword(
	password: string,
	storedHash: string,
): Promise<boolean> {
	const [saltBase64, hashBase64] = storedHash.split(":");
	if (!saltBase64 || !hashBase64) {
		return false;
	}

	const encoder = new TextEncoder();
	const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const hash = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt,
			iterations: ITERATIONS,
			hash: HASH_ALGORITHM,
		},
		keyMaterial,
		256,
	);

	const computedHashBase64 = arrayBufferToBase64(hash);

	// Constant-time comparison
	if (computedHashBase64.length !== hashBase64.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < computedHashBase64.length; i++) {
		result |= computedHashBase64.charCodeAt(i) ^ hashBase64.charCodeAt(i);
	}

	return result === 0;
}

interface JWTPayload {
	sub: string;
	iat: number;
	exp: number;
}

const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createToken(
	userId: string,
	secret: string,
): Promise<string> {
	const header = { alg: "HS256", typ: "JWT" };
	const now = Math.floor(Date.now() / 1000);
	const payload: JWTPayload = {
		sub: userId,
		iat: now,
		exp: now + JWT_EXPIRY_SECONDS,
	};

	const encoder = new TextEncoder();
	const headerB64 = btoa(JSON.stringify(header))
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
	const payloadB64 = btoa(JSON.stringify(payload))
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

	const data = `${headerB64}.${payloadB64}`;

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));

	const signatureB64 = arrayBufferToBase64(signature)
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

	return `${data}.${signatureB64}`;
}

export async function verifyToken(
	token: string,
	secret: string,
): Promise<{ userId: string } | null> {
	const parts = token.split(".");
	if (parts.length !== 3) {
		return null;
	}

	const [headerB64, payloadB64, signatureB64] = parts;
	const data = `${headerB64}.${payloadB64}`;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	// Convert base64url to base64
	const signatureBase64 = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
	const paddedSignature =
		signatureBase64 + "=".repeat((4 - (signatureBase64.length % 4)) % 4);
	const signatureBuffer = base64ToArrayBuffer(paddedSignature);

	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		signatureBuffer,
		encoder.encode(data),
	);

	if (!isValid) {
		return null;
	}

	// Decode payload
	const payloadBase64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
	const paddedPayload =
		payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
	const payload: JWTPayload = JSON.parse(atob(paddedPayload));

	// Check expiration
	const now = Math.floor(Date.now() / 1000);
	if (payload.exp < now) {
		return null;
	}

	return { userId: payload.sub };
}
