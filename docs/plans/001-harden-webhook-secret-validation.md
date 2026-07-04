# Plan 001: Make WEBHOOK_SECRET a hard validation error, matching JWT_SECRET

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 917b4bc..HEAD -- src/lib/env.ts src/test`
> If `src/lib/env.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `917b4bc`, 2026-06-11

## Why this matters

`WEBHOOK_SECRET` protects `POST /api/webhook/inbound`, the endpoint that
ingests email content into feeds. The webhook authenticates by comparing the
caller's `x-webhook-verification-token` header against `env.WEBHOOK_SECRET`
using `timingSafeEqual`. Two related weaknesses exist today:

1. `validateEnv` treats a misconfigured `WEBHOOK_SECRET` as a **warning**, not
   an error — unlike `JWT_SECRET` and `ADMIN_API_KEY`, which throw and block
   startup. So the worker will happily run with the placeholder
   `change-me-in-production` secret.
2. If `WEBHOOK_SECRET` is set to an **empty string**, `validateEnv` does not
   warn at all, and `timingSafeEqual("", "")` returns `true` — meaning a
   request with a missing/empty token authenticates successfully.

Making `WEBHOOK_SECRET` validation as strict as `JWT_SECRET` closes the
deploy-with-default and empty-secret holes. After this lands, the worker
refuses to serve any request until a real webhook secret is configured.

## Current state

- `src/lib/env.ts` — environment validation, run once per isolate from
  `src/worker.ts:71-75` (the `app.use("*")` middleware). `validateEnv` collects
  `errors[]` (which throw) and `warnings[]` (which only `console.warn`).

  The JWT validator is the pattern to copy (`src/lib/env.ts:22-39`):

  ```ts
  function validateJwtSecret(value: string, errors: string[]): void {
    if (!value || value.trim() === "") {
      errors.push(
        "JWT_SECRET must be set to a non-empty, secure value in production. This secret is used to sign authentication tokens."
      );
      return;
    }

    if (value === "change-me-in-production") {
      errors.push(
        "JWT_SECRET must be set to a secure value in production. This secret is used to sign authentication tokens."
      );
    }

    if (value.length < 32) {
      errors.push("JWT_SECRET must be at least 32 characters long for security.");
    }
  }
  ```

  The webhook secret is currently handled inline as a warning
  (`src/lib/env.ts:60-78`, inside `validateEnv`):

  ```ts
  export function validateEnv(env: typeof worker.Env): void {
    const warnings: string[] = [];
    const errors: string[] = [];

    validateAdminApiKey(env.ADMIN_API_KEY, errors);
    validateJwtSecret(env.JWT_SECRET, errors);

    if (env.WEBHOOK_SECRET === "change-me-in-production") {
      warnings.push(
        "WEBHOOK_SECRET should be set to a secure value for webhook security."
      );
    }

    const inboundEmailDomain = env.INBOUND_EMAIL_DOMAIN?.trim();
    // ...
  ```

- `src/routes/webhook.ts:47-51` — the consumer; confirms an empty secret is
  exploitable:

  ```ts
  function validateWebhookSecret(request: Request, env: WorkerEnv): boolean {
    const webhookToken =
      request.headers.get("x-webhook-verification-token") || "";
    return timingSafeEqual(webhookToken, env.WEBHOOK_SECRET);
  }
  ```

- `src/lib/security.ts:5-21` — `timingSafeEqual`; returns `true` when both
  inputs are empty strings (length 0 == length 0, zero mismatches).

- Repo conventions: TypeScript strict mode, Biome formatting (tabs + double
  quotes), small focused functions with early returns. Error messages are full
  sentences explaining the consequence. Match the existing `validateJwtSecret`
  style exactly.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `bun install`      | exit 0              |
| Typecheck | `bun run typecheck`| exit 0, no errors   |
| Tests     | `bun run test`     | all pass            |
| Lint      | `bun run lint`     | exit 0              |

> **Lint note**: `bun run lint` (Biome) passes cleanly on the current tree.
> After your changes it must still exit 0.

## Scope

**In scope** (the only files you should modify):
- `src/lib/env.ts`
- `src/test/env.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/routes/webhook.ts` — the consumer is already correct; the fix is to
  guarantee a valid secret exists, not to change the comparison.
- `src/lib/security.ts` — `timingSafeEqual` behavior is fine once an empty
  secret can never reach production.
- `alchemy.run.ts` — the placeholder default lives here intentionally for
  local/preview; validation is the guard, not the default.

## Git workflow

- Branch: `advisor/001-harden-webhook-secret`
- Commit style: conventional commits, matching `git log` (e.g.
  `fix(env): require WEBHOOK_SECRET like JWT_SECRET`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `validateWebhookSecret` validator function

In `src/lib/env.ts`, add a new function modeled exactly on `validateJwtSecret`,
placed next to it (after `validateJwtSecret`, before `validateAppBaseUrl`).
Webhook secrets do not have the 32-char requirement that JWT signing keys do,
so include only the empty and placeholder checks:

```ts
function validateWebhookSecret(value: string, errors: string[]): void {
  if (!value || value.trim() === "") {
    errors.push(
      "WEBHOOK_SECRET must be set to a non-empty, secure value in production. This secret authenticates the inbound email webhook."
    );
    return;
  }

  if (value === "change-me-in-production") {
    errors.push(
      "WEBHOOK_SECRET must be set to a secure value in production. This secret authenticates the inbound email webhook."
    );
  }
}
```

**Verify**: `bun run typecheck` → exit 0, no errors.

### Step 2: Call the validator and remove the old warning

In `validateEnv`, replace the inline `WEBHOOK_SECRET` warning block:

```ts
  if (env.WEBHOOK_SECRET === "change-me-in-production") {
    warnings.push(
      "WEBHOOK_SECRET should be set to a secure value for webhook security."
    );
  }
```

with a call to the new validator, alongside the other error-producing
validators near the top of the function:

```ts
  validateAdminApiKey(env.ADMIN_API_KEY, errors);
  validateJwtSecret(env.JWT_SECRET, errors);
  validateWebhookSecret(env.WEBHOOK_SECRET, errors);
```

Confirm no remaining reference to the removed warning text:

**Verify**: `grep -n "WEBHOOK_SECRET should be set" src/lib/env.ts` → no output (exit 1).

### Step 3: Write tests for the validator

Create `src/test/env.test.ts`. There is no existing test for `env.ts`, so model
the file structure on `src/test/auth.test.ts` (same import style, `describe`/`it`,
`expect`). `validateEnv` takes `typeof worker.Env`; build a minimal valid env
object and override one field per test. A valid baseline must satisfy ALL
existing validators (admin key non-empty and not the placeholder, JWT secret
>= 32 chars and not placeholder, inbound domain set, valid `APP_BASE_URL`).

Cover these cases (calls that should throw use `expect(() => validateEnv(env)).toThrow()`):

- Valid env including a real `WEBHOOK_SECRET` → does not throw.
- `WEBHOOK_SECRET: ""` → throws.
- `WEBHOOK_SECRET: "change-me-in-production"` → throws.
- `WEBHOOK_SECRET: "   "` (whitespace only) → throws.

Cast the test env with `as unknown as typeof import("../../alchemy.run.ts").worker.Env`
if needed to satisfy types, OR define a local object typed loosely and cast at
the call site — match whatever keeps `bun run typecheck` clean. Keep it minimal.

**Verify**: `bun run test 2>&1 | grep -E "env.test|Test Files"` → shows the new
file and all test files passing.

## Test plan

- New file `src/test/env.test.ts` with the four cases above.
- Structural pattern: `src/test/auth.test.ts`.
- Verification: `bun run test` → all pass (was 51, now 55+).

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; `src/test/env.test.ts` exists with >= 4 passing tests
- [ ] `grep -n "WEBHOOK_SECRET should be set" src/lib/env.ts` returns nothing
- [ ] `grep -n "validateWebhookSecret" src/lib/env.ts` shows the function defined and called
- [ ] `bun run lint` exits 0
- [ ] `git status --porcelain` shows only `src/lib/env.ts` and `src/test/env.test.ts` modified/created
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report back if:

- `src/lib/env.ts` no longer matches the "Current state" excerpts (drift).
- You cannot construct a valid baseline env that passes `validateEnv` without
  throwing — this means another validator changed; report what.
- Making the tests typecheck would require touching files outside scope.

## Maintenance notes

- If a new required secret/binding is added later, follow this same
  validator-pattern (error, not warning) for anything that gates auth.
- Reviewer should confirm the four test cases actually exercise the throw path
  (a test that builds an *invalid* baseline would pass for the wrong reason —
  the "valid env does not throw" case guards against that).
- `timingSafeEqual("", "")` returning `true` is now unreachable in production
  but remains a latent footgun; left as-is intentionally to keep this plan
  scoped to validation.
