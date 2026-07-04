# Plan 004: Fix RateLimiterDO alarm cleanup to respect the actual window size

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 917b4bc..HEAD -- src/durable-objects/rate-limiter.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `917b4bc`, 2026-06-11

## Why this matters

`RateLimiterDO` enforces per-IP rate limits (signup 3/hr, login 5/min, waitlist
5/hr). Each window's counter is stored under `count:{windowStart}` where
`windowStart = floor(now / window)` — so the numeric key is in **window units**,
and "window units" differ per config (minutes for the 60s limiter, hours for the
3600s limiters). The `alarm()` cleanup compares that key against `now / 60`,
a value hardcoded to the 60-second window:

```ts
if (windowStart < now / 60) {
  keysToDelete.push(key);
}
```

For a 3600s window, `windowStart ≈ now/3600`, which is always far less than
`now/60`, so the condition is **always true** — including for the window that is
currently active inside the alarm's buffer period. Deleting an active counter
resets a user's count to zero, letting them exceed the intended limit. The bug
is low-impact (rate limits are a secondary defense and the DO is keyed per
IP+action), but it defeats the cleanup's own stated intent of only removing
windows that are safely past.

This plan makes cleanup compute the cutoff from the same window unit the key was
written in, so only genuinely-expired windows are deleted.

## Current state

- `src/durable-objects/rate-limiter.ts` — the Durable Object. Relevant pieces:

  Write path (`rate-limiter.ts:31-37`) — note `storageKey` encodes only the
  window index, not the window size:

  ```ts
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.window);
  const storageKey = `count:${windowStart}`;
  ```

  Alarm scheduling (`rate-limiter.ts:67-74`):

  ```ts
  const deleteAt = (now + config.window * 2) * 1000;
  const currentAlarm = await this.state.storage.getAlarm();
  if (currentAlarm === null || currentAlarm < deleteAt) {
    await this.state.storage.setAlarm(deleteAt);
  }
  ```

  The buggy cleanup (`rate-limiter.ts:83-100`):

  ```ts
  async alarm() {
    // Only delete expired window keys, not the entire storage
    const now = Math.floor(Date.now() / 1000);
    const entries = await this.state.storage.list<number>();
    const keysToDelete: string[] = [];

    for (const [key] of entries) {
      if (!key.startsWith("count:")) {
        continue;
      }
      const windowStart = Number.parseInt(key.split(":")[1], 10);
      // Delete windows that ended more than one window ago (conservative)
      // We don't know the exact window size, but if the alarm fires,
      // the window that scheduled it is at least 2x past
      if (windowStart < now / 60) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      await this.state.storage.delete(keysToDelete);
    }
  }
  ```

  The comment "We don't know the exact window size" is the root problem: the
  window size IS knowable if we persist it.

- `ALLOWED_CONFIGS` (`rate-limiter.ts:4-8`) restricts configs to exactly three:
  `3:3600`, `5:60`, `5:3600`. So a single DO instance only ever sees one window
  size in practice (each rate-limit purpose uses a distinct DO-name prefix:
  `signup:`, `login:`, `waitlist:`), but the code should not rely on that.

- Conventions: TypeScript strict, no `any`, small functions, early returns.
  Durable Object storage is async (`txn.get`, `storage.put`, `storage.list`).

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
- `src/durable-objects/rate-limiter.ts`
- `src/test/rate-limiter.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/lib/rate-limit.ts` — the `DurableRateLimiter` client wrapper is correct.
  (Note: the deprecated KV `RateLimiter` class in that file is removed by
  Plan 005, not here.)
- The `fetch()` request/response contract and `RateLimitResult` shape — callers
  depend on it.

## Git workflow

- Branch: `advisor/004-rate-limiter-alarm`
- Commit style: conventional commits (e.g.
  `fix(rate-limiter): respect window size in alarm cleanup`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Persist the window size alongside each counter key

Change the storage key to encode the window size so cleanup can reconstruct the
real expiry. Update the write path (`rate-limiter.ts:33`) from:

```ts
const storageKey = `count:${windowStart}`;
```

to embed the window size:

```ts
const storageKey = `count:${config.window}:${windowStart}`;
```

This changes the key format to `count:{window}:{windowStart}`. Existing
in-flight keys in the old `count:{windowStart}` format will simply age out (see
Step 3's cleanup handles unknown formats safely), and counters are ephemeral
rate-limit state — losing a few mid-deploy is harmless.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Rewrite `alarm()` to compute the cutoff per key

Replace the parse-and-compare logic so it derives the window size from the key
and deletes a key only once its window has fully ended plus a one-window buffer
(matching the `window * 2` scheduling intent). Defensively skip keys that don't
match the new 3-part format:

```ts
async alarm() {
  const now = Math.floor(Date.now() / 1000);
  const entries = await this.state.storage.list<number>();
  const keysToDelete: string[] = [];

  for (const [key] of entries) {
    const parts = key.split(":");
    // Expected format: count:{window}:{windowStart}
    if (parts[0] !== "count" || parts.length !== 3) {
      keysToDelete.push(key); // legacy/unknown key: safe to drop
      continue;
    }

    const window = Number.parseInt(parts[1], 10);
    const windowStart = Number.parseInt(parts[2], 10);
    if (Number.isNaN(window) || Number.isNaN(windowStart)) {
      keysToDelete.push(key);
      continue;
    }

    // The window covers [windowStart*window, (windowStart+1)*window).
    // Delete only once we are a full window past its end (2x buffer),
    // so an active or recently-active counter is never reset early.
    const windowEnd = (windowStart + 1) * window;
    if (now >= windowEnd + window) {
      keysToDelete.push(key);
    }
  }

  if (keysToDelete.length > 0) {
    await this.state.storage.delete(keysToDelete);
  }
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Add unit tests for the cleanup logic

There is no existing test for the DO. Testing `alarm()` end-to-end needs a
Durable Object storage mock. The simplest robust approach: extract the
pure decision — "given `now`, `window`, `windowStart`, should this key be
deleted?" — is tempting but **do not refactor production code beyond Steps 1–2**
unless the test cannot otherwise be written. Instead, test against a minimal
in-memory storage stub.

Create `src/test/rate-limiter.test.ts`. Build a fake `DurableObjectState` with a
`Map`-backed `storage` exposing `list()`, `delete(keys)`, `get`, `put`,
`getAlarm`, `setAlarm`, and `transaction(fn)` (transaction just invokes `fn`
with the same storage). Construct `new RateLimiterDO(fakeState, fakeEnv)`.

Cover:

1. **Active counter is preserved.** Put a key `count:3600:${floor(now/3600)}`
   (the current hourly window). Run `alarm()`. Assert the key still exists.
2. **Expired counter is deleted.** Put a key
   `count:3600:${floor(now/3600) - 3}` (3 hours ago). Run `alarm()`. Assert the
   key is gone.
3. **60s window boundary.** Put `count:60:${floor(now/60)}` (current minute) →
   preserved; `count:60:${floor(now/60) - 5}` (5 min ago) → deleted.
4. **Legacy/unknown key format is dropped.** Put `count:12345` (old 2-part
   format) and a non-`count:` key; assert the `count:`-prefixed legacy key is
   removed and the unrelated key handling matches your implementation (your
   loop deletes any key whose first segment isn't `count` only if... — re-check:
   the implementation above deletes a key when `parts[0] !== "count"`. A
   non-count key like `alarm-meta` would be deleted. If the DO never stores such
   keys this is fine; assert on the legacy `count:12345` removal specifically).

> Time: the production code uses `Date.now()`. In tests, compute expected window
> indices from `Date.now()` at test time the same way the code does, OR if your
> test runner supports fake timers (`vi.useFakeTimers()` / `vi.setSystemTime()`),
> pin the clock for determinism. Prefer pinning the clock if available; check how
> other tests handle time first.

**Verify**: `bun run test 2>&1 | grep -E "rate-limiter.test|Test Files"` →
present and passing.

## Test plan

- New file `src/test/rate-limiter.test.ts` with the four cases above.
- Structural pattern: `src/test/utils.ts` shows how the repo fakes Cloudflare
  bindings with plain objects/Maps — mirror that approach for `DurableObjectState`.
- The load-bearing test is case 1 (active counter preserved) — that is the exact
  behavior the old `/60` bug violated for hourly windows.
- Verification: `bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; `src/test/rate-limiter.test.ts` exists with >= 4 passing tests
- [ ] `grep -n "now / 60" src/durable-objects/rate-limiter.ts` returns nothing
- [ ] storage key format is `count:{window}:{windowStart}` (verify: `grep -n 'count:\${config.window}' src/durable-objects/rate-limiter.ts`)
- [ ] test case proves an active hourly counter survives `alarm()`
- [ ] `bun run lint` exits 0
- [ ] `git status --porcelain` shows only the DO file and the new test
- [ ] `plans/README.md` status row for 004 updated to DONE

## STOP conditions

Stop and report back if:

- The "Current state" excerpt no longer matches the live file (drift).
- You cannot construct a working `DurableObjectState` stub that lets `alarm()`
  run without touching production code — report what API surface is missing
  rather than refactoring production code to make it testable.
- Changing the storage key format appears to break the `fetch()` read/write path
  tests — it should not, since read and write both derive the key the same way;
  if they diverge, report it.

## Maintenance notes

- The storage key now carries the window size; any future change to how counters
  are keyed must keep `alarm()`'s parser in sync (both use `count:{window}:{windowStart}`).
- Reviewer should confirm the buffer (`windowEnd + window`, i.e. 2x window past
  start) matches the alarm scheduling (`now + window*2`) so cleanup never races
  ahead of a scheduled alarm.
- Deferred: consolidating the duplicated window-math between `fetch()` and
  `alarm()` into a shared helper — minor, left out to keep this change tight.
