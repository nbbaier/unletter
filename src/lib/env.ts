import type { worker } from "../../alchemy.run.ts";

export function validateEnv(env: typeof worker.Env): void {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Validate ADMIN_API_KEY
	const adminApiKey = env.ADMIN_API_KEY;
	if (!adminApiKey || adminApiKey.trim() === "") {
		errors.push(
			"ADMIN_API_KEY must be set to a non-empty, secure value in production. This key protects admin endpoints.",
		);
	} else if (adminApiKey === "change-me-in-production") {
		errors.push(
			"ADMIN_API_KEY must be set to a secure value in production. This key protects admin endpoints.",
		);
	}

	// Validate JWT_SECRET
	const jwtSecret = env.JWT_SECRET;
	if (typeof jwtSecret !== "string" || jwtSecret.trim() === "") {
		errors.push(
			"JWT_SECRET must be set to a non-empty, secure value in production. This secret is used to sign authentication tokens.",
		);
	} else {
		if (jwtSecret === "change-me-in-production") {
			errors.push(
				"JWT_SECRET must be set to a secure value in production. This secret is used to sign authentication tokens.",
			);
		}

		if (jwtSecret.length < 32) {
			errors.push(
				"JWT_SECRET must be at least 32 characters long for security.",
			);
		}
	}

	if (env.WEBHOOK_SECRET === "change-me-in-production") {
		warnings.push(
			"WEBHOOK_SECRET should be set to a secure value for webhook security.",
		);
	}

	// Log warnings
	if (warnings.length > 0) {
		console.warn(
			`\n⚠️  Environment Warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`,
		);
	}

	// Throw on errors
	if (errors.length > 0) {
		throw new Error(
			`\n❌ Environment Validation Failed:\n${errors.map((e) => `  - ${e}`).join("\n")}\n\nPlease configure these environment variables before deploying.`,
		);
	}

	console.log("✓ Environment validation passed");
}
