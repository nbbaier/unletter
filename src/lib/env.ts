import type { worker } from "../../alchemy.run.ts";

export function validateEnv(env: typeof worker.Env): void {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Critical secrets that must be set in production
	if (env.ADMIN_API_KEY === "change-me-in-production") {
		errors.push(
			"ADMIN_API_KEY must be set to a secure value in production. This key protects admin endpoints.",
		);
	}

	if (env.JWT_SECRET === "change-me-in-production") {
		errors.push(
			"JWT_SECRET must be set to a secure value in production. This secret is used to sign authentication tokens.",
		);
	}

	if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
		errors.push("JWT_SECRET must be at least 32 characters long for security.");
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
