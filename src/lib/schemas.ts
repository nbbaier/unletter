import { z } from "zod";

// Auth schemas
export const SignupSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

// Feed schemas
export const CreateFeedSchema = z.object({
  name: z
    .string()
    .min(1, "Feed name is required")
    .max(100, "Feed name must be less than 100 characters")
    .trim(),
});

// Waitlist schema
export const WaitlistSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  website: z.string().trim().max(200).optional(),
  turnstileToken: z.string().trim().optional(),
});

// Helper function to validate and return typed data
export function validate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

// Helper to extract first error message
export function getFirstError(error: z.ZodError<unknown>): string {
  const firstIssue = error.issues[0];
  return firstIssue?.message || "Validation failed";
}
