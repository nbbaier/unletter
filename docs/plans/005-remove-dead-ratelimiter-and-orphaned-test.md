# Plan 005: Remove the dead KV RateLimiter class and the orphaned performance test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 917b4bc..HEAD -- src/lib/rate-limit.ts tests/performance-feeds.test.ts`
> If either changed since this plan was written, compare against the "Current
> state" excerpts before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but see note re: Plan 004 — independent, can run in any order)
- **Category**: tech-debt
- **Planned at**: commit `917b4bc`, 2026-06-11

## Why this matters

Two pieces of dead weight make the codebase harder to read and trust:

1. **`src/lib/rate-limit.ts` exports a deprecated `RateLimiter` class** (the
   KV-based one with a documented race condition). It is unused — the app uses
   `DurableRateLimiter` everywhere. A future reader could mistake it for a live
   option. `grep` confirms no instantiation anywhere in `src/`.
2. **`tests/performance-feeds.test.ts` never runs.** The vitest `include` glob
   is `src/**/*.test.ts` (`vitest.config.ts:11`), and this file lives in
   `tests/`, so it is silently excluded from `bun run test`. It is a timing
   probe (logs a duration, asserts only status + length) that overlaps the real
   functional coverage added by Plan 002. Dead test files rot and mislead.

Removing both shrinks the surface area with zero behavior change. After this
lands, every test file in the repo actually runs, and the only rate limiter in
the code is the one in use.

## Current state

- `src/lib/rate-limit.ts` — contains BOTH the live `DurableRateLimiter`
  (keep) and the deprecated `RateLimiter` (remove). The deprecated class spans
  `rate-limit.ts:11-75`:

  ```ts
  /**
   * @deprecated Use DurableRateLimiter instead for strict rate limiting.
   */
  export class RateLimiter {
    private readonly kv: KVNamespace;
    private readonly config: RateLimitConfig;
    // ... ~60 lines, ends with the check() method returning RateLimitResult
  }

  export class DurableRateLimiter {   // <-- KEEP everything from here down
  ```

  The shared interfaces `RateLimitConfig` and `RateLimitResult`
  (`rate-limit.ts:1-9`) and the helpers `getClientIP` / `rateLimitResponse` at
  the bottom of the file are all used by `DurableRateLimiter` and its callers —
  **keep them**.

  Confirmed unused: `grep -rn "new RateLimiter\b" src/` returns nothing; the
  only `RateLimiter` definition is this class.

- `tests/performance-feeds.test.ts` — 65 lines, imports `../src/lib/auth.ts`
  and `../src/routes/feeds.ts`, seeds 50 string-id feeds, calls `handleListFeeds`
  with a latency-injecting mock, logs the duration, and asserts
  `response.status === 200` and `data.feeds.length === 50`. It is the only file
  under `tests/`.

- `vitest.config.ts:11` — `include: ["src/**/*.test.ts"]` (this is why the
  `tests/` file never runs). **Do not widen this glob** — that would suddenly
  start running an orphaned, latency-based test. The plan deletes the file
  instead.

- `tsconfig.json` — confirm whether `tests/` is in the TypeScript build set
  before deleting (it may be referenced by `tsgo -b`). Step 2 checks this.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `bun install`      | exit 0              |
| Typecheck | `bun run typecheck`| exit 0, no errors   |
| Tests     | `bun run test`     | all pass            |
| Lint      | `bun run lint`     | exit 0              |

## Scope

**In scope** (the only files you should modify/delete):
- `src/lib/rate-limit.ts` (remove the deprecated class only)
- `tests/performance-feeds.test.ts` (delete)
- The `tests/` directory (remove if it becomes empty after the delete)

**Out of scope** (do NOT touch):
- `DurableRateLimiter`, `RateLimitConfig`, `RateLimitResult`, `getClientIP`,
  `rateLimitResponse` in `rate-limit.ts` — all live, keep exactly as-is.
- `vitest.config.ts` — do not change the `include` glob.
- `src/durable-objects/rate-limiter.ts` — that is Plan 004's file; untouched here.

## Git workflow

- Branch: `advisor/005-remove-dead-code`
- Commit style: conventional commits (e.g.
  `chore: remove deprecated KV RateLimiter and orphaned perf test`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Delete the deprecated `RateLimiter` class

In `src/lib/rate-limit.ts`, remove the entire `RateLimiter` class and its
`@deprecated` doc comment (the block from the `/** @deprecated ... */` comment
through the closing `}` of the class, immediately before
`export class DurableRateLimiter`). Keep everything else in the file byte-for-byte.

**Verify**:
- `grep -n "class RateLimiter\b" src/lib/rate-limit.ts` → no output.
- `grep -n "class DurableRateLimiter" src/lib/rate-limit.ts` → still present.
- `grep -n "export function getClientIP\|export function rateLimitResponse" src/lib/rate-limit.ts` → both still present.
- `bun run typecheck` → exit 0.

### Step 2: Delete the orphaned performance test

Check whether `tsgo -b` (the build) references `tests/`:

- `grep -rn "tests" tsconfig.json` and inspect any `include`/`references`.
  - If `tests/` is NOT referenced, delete the file:
    `git rm tests/performance-feeds.test.ts` (or plain delete + stage).
  - If `tests/` IS referenced in tsconfig in a way that would error on an empty
    or missing directory, STOP and report — do not edit tsconfig under this plan.
- If, after deleting the file, the `tests/` directory is empty, remove the empty
  directory.

**Verify**:
- `test ! -f tests/performance-feeds.test.ts` → exit 0 (file gone).
- `bun run typecheck` → exit 0.
- `bun run test 2>&1 | grep "Test Files"` → still the same suite, all passing
  (this file was never part of it, so the count of passing files is unchanged).

### Step 3: Full verification

Run the whole gate:

**Verify**:
- `bun run typecheck` → exit 0.
- `bun run test` → all pass (51 if Plan 002/003/001/004 not yet applied; more if they are).
- `bun run lint` → exit 0.

## Test plan

- No new tests. This plan removes code and a non-running test.
- The guarantee is negative: nothing that was running stops working. The
  `bun run test` gate proves the live suite is unaffected (the deleted file was
  never in it), and `bun run typecheck` proves no live code depended on the
  removed class.

## Done criteria

ALL must hold:

- [ ] `grep -rn "class RateLimiter\b" src/` returns nothing
- [ ] `grep -rn "DurableRateLimiter" src/` still returns its definition and usages (unchanged)
- [ ] `tests/performance-feeds.test.ts` no longer exists
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; suite still green
- [ ] `bun run lint` exits 0
- [ ] `git status --porcelain` shows only `src/lib/rate-limit.ts` modified and `tests/performance-feeds.test.ts` deleted
- [ ] `plans/README.md` status row for 005 updated to DONE

## STOP conditions

Stop and report back if:

- `grep -rn "new RateLimiter\b" src/` or `grep -rn "RateLimiter\b" src/ | grep -v Durable | grep -v RateLimiterDO | grep -v rate-limiter.ts`
  finds a live usage of the deprecated class — it is NOT dead; do not delete it.
- `tsconfig.json` references `tests/` such that deleting the file breaks the
  build — report it instead of editing tsconfig.
- Removing the class causes any typecheck or test failure — report the failure.

## Maintenance notes

- If a performance regression test for `handleListFeeds` is wanted later, write
  it under `src/test/` (so the `include` glob picks it up) and make it
  deterministic — assert on KV-read **count**, not wall-clock duration (Plan 002
  adds exactly this kind of assertion; reuse that approach).
- Reviewer should confirm the live `DurableRateLimiter` and the shared helpers
  are untouched.
