# Plan 002: Serve the feed list from denormalized data, eliminating the N+1 KV reads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 917b4bc..HEAD -- src/routes/feeds.ts`
> If `src/routes/feeds.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `917b4bc`, 2026-06-11

## Why this matters

A prior commit ("Optimize feed listing with denormalization and lazy
migration") started storing each feed's `name`, `emailAddress`, and `createdAt`
inline in the `user:{userId}:feeds` list so the list endpoint wouldn't need a
KV read per feed. But `handleListFeeds` was never switched over: it still issues
one `env.DATA.get(\`feed:${feedId}\`)` for **every** feed in the list. A user
with 25 feeds (the cap) triggers 1 + 25 KV reads on every `GET /api/feeds`. The
denormalized data is being written but never read — the optimization is dead.

This plan wires the read path to use the denormalized data when present, falling
back to a per-feed fetch only for legacy string entries that predate the
migration. After this lands, the common case is a single KV read.

**Important nuance (why Risk = MED):** the current per-feed fetch also acts as a
**pruning filter** — feeds that were deleted but still linger in the user list
return `null` from KV and get filtered out (`feeds.ts:111-127`). Reading purely
from denormalized data loses that pruning, so a feed deleted out-of-band could
reappear in the list. In practice `handleDeleteFeed` (`feeds.ts:212-219`) already
removes the feed from the user list atomically with deletion, so a denormalized
entry should never outlive its feed. This plan trusts that invariant; the STOP
conditions and tests guard it.

## Current state

- `src/routes/feeds.ts` — feed CRUD + RSS/Atom generation.

  **Write path** stores the denormalized shape (`feeds.ts:62-69`):

  ```ts
  // Keep this denormalized shape in sync with any future feed update path.
  userFeeds.push({
    id: feed.id,
    name: feed.name,
    emailAddress: feed.emailAddress,
    createdAt: feed.createdAt,
  });
  await env.DATA.put(`user:${auth.userId}:feeds`, JSON.stringify(userFeeds));
  ```

  **Read path** ignores it and re-fetches each feed (`feeds.ts:91-134`):

  ```ts
  export async function handleListFeeds(
    request: Request,
    env: WorkerEnv
  ): Promise<Response> {
    const auth = await authenticateRequest(request, env);
    if (auth instanceof Response) {
      return auth;
    }

    try {
      const userFeedsData = await env.DATA.get(`user:${auth.userId}:feeds`);
      const userFeeds: (string | Omit<Feed, "userId">)[] = userFeedsData
        ? JSON.parse(userFeedsData)
        : [];

      const feedsWithNulls = await Promise.all(
        userFeeds.map(async (item) => {
          const feedId = typeof item === "string" ? item : item.id;
          const feedData = await env.DATA.get(`feed:${feedId}`);

          if (!feedData) {
            return null;
          }

          const feed: Feed = JSON.parse(feedData);
          return {
            id: feed.id,
            name: feed.name,
            emailAddress: feed.emailAddress,
            createdAt: feed.createdAt,
          };
        })
      );

      const feeds = feedsWithNulls.filter(
        (f): f is Omit<Feed, "userId"> => f !== null
      );

      return jsonResponse({ feeds });
    } catch (error) {
      console.error("List feeds error:", error);
      return jsonResponse({ error: "Failed to list feeds" }, 500);
    }
  }
  ```

  The list entry type is `string | Omit<Feed, "userId">`. A `string` entry is a
  legacy pre-migration id; an object entry already carries
  `{ id, name, emailAddress, createdAt }`.

- `src/types.ts:8-14` — `Feed` is `{ createdAt, emailAddress, id, name, userId }`,
  so `Omit<Feed, "userId">` is exactly the denormalized object shape.

- `src/test/feeds.routes.test.ts` — existing route tests (296 lines). It seeds
  feeds via `handleCreateFeed` and lists via `handleListFeeds`; reuse its
  helpers and `createMockEnv` from `src/test/utils.ts`. Note the mock KV in
  `utils.ts:26-42` is a plain `Map` — its `get`/`put`/`delete` are synchronous
  resolves, so you can assert on store contents directly.

- Repo conventions: small focused functions, early returns, no `any`
  (`unknown` + narrowing). Match the existing style in this file.

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
- `src/routes/feeds.ts` (only `handleListFeeds`)
- `src/test/feeds.routes.test.ts` (add tests)

**Out of scope** (do NOT touch):
- `handleCreateFeed`, `handleDeleteFeed`, `handleGetFeed` in the same file —
  the write/delete/RSS paths are correct and out of scope.
- The denormalized write shape — do not change what is stored, only what is read.
- Any change to the JSON response shape `{ feeds: [...] }` — clients depend on it.

## Git workflow

- Branch: `advisor/002-feed-list-denormalized`
- Commit style: conventional commits (e.g.
  `perf(feeds): serve list from denormalized data`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Rewrite `handleListFeeds` to read denormalized entries directly

Replace the body of the `try` block so that:

- An **object** entry (`typeof item !== "string"`) is returned directly as
  `{ id, name, emailAddress, createdAt }` — **no KV read**.
- A **string** entry (legacy) still falls back to `env.DATA.get(\`feed:${id}\`)`,
  parsing and returning the four fields, or `null` if the feed is gone.

Target shape:

```ts
const feedsWithNulls = await Promise.all(
  userFeeds.map(async (item) => {
    if (typeof item !== "string") {
      return {
        id: item.id,
        name: item.name,
        emailAddress: item.emailAddress,
        createdAt: item.createdAt,
      };
    }

    // Legacy string entry predating denormalization: fetch to hydrate.
    const feedData = await env.DATA.get(`feed:${item}`);
    if (!feedData) {
      return null;
    }
    const feed: Feed = JSON.parse(feedData);
    return {
      id: feed.id,
      name: feed.name,
      emailAddress: feed.emailAddress,
      createdAt: feed.createdAt,
    };
  })
);
```

Keep the existing `.filter((f): f is Omit<Feed, "userId"> => f !== null)` and
the `jsonResponse({ feeds })` return unchanged.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Confirm no behavioral regression in existing tests

**Verify**: `bun run test 2>&1 | grep -E "feeds.routes|Test Files"` → existing
feed route tests still pass.

### Step 3: Add tests proving the read path no longer fetches per feed

In `src/test/feeds.routes.test.ts`, add a `describe`/`it` block (reuse the
file's existing helpers and `createMockEnv`). Cover:

1. **Denormalized entries served without per-feed reads.** Seed
   `user:${userId}:feeds` directly with an array of objects
   `[{ id, name, emailAddress, createdAt }, ...]` (bypass `handleCreateFeed`).
   Then wrap `env.DATA.get` to count calls (or assert the returned `feeds`
   match the seeded objects exactly). Assert the response lists all feeds and
   that **no** `feed:${id}` key was read (count `get` calls whose argument
   starts with `feed:` → expect 0; only the `user:...:feeds` read happens).
2. **Legacy string entries still hydrate via fetch.** Seed
   `user:${userId}:feeds` with `["legacy-1"]` and a matching `feed:legacy-1`
   blob; assert the listed feed reflects the fetched blob.
3. **Legacy string entry with missing feed is pruned.** Seed
   `["ghost-1"]` with no `feed:ghost-1` blob; assert it is filtered out.

For call-counting, wrap the mock: capture `env.DATA.get`, replace with a spy
that increments a counter and delegates. Keep it minimal and local to the test.

**Verify**: `bun run test 2>&1 | grep -E "Test Files|Tests"` → all pass, count
increased by the number of new tests.

## Test plan

- Add the three cases above to `src/test/feeds.routes.test.ts`.
- Structural pattern: the existing tests in that same file.
- The critical assertion is case 1's "zero `feed:` reads" — that is what proves
  the N+1 is gone, not just that output is correct.
- Verification: `bun run test` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; new tests in `feeds.routes.test.ts` pass, including the "zero per-feed reads for denormalized entries" assertion
- [ ] `handleListFeeds` returns object entries without calling `env.DATA.get(\`feed:...\`)` (verified by the new test)
- [ ] Legacy string entries still work (hydrate + prune tests pass)
- [ ] `bun run lint` exits 0
- [ ] `git status --porcelain` shows only `src/routes/feeds.ts` and `src/test/feeds.routes.test.ts` changed
- [ ] `plans/README.md` status row for 002 updated to DONE

## STOP conditions

Stop and report back if:

- `handleListFeeds` no longer matches the "Current state" excerpt (drift).
- You find a code path that **mutates** a feed's `name`/`emailAddress` after
  creation (e.g. a rename endpoint) — that would make the denormalized copy
  stale, and this plan's assumption is false. Report it; the fix would need to
  update the denormalized entry on rename, which is out of this plan's scope.
- A test reveals a feed appearing in the list after deletion — report it; the
  delete-path invariant this plan trusts is broken.

## Maintenance notes

- **If a feed-rename or feed-update endpoint is ever added**, it MUST update the
  denormalized `{ name, emailAddress, createdAt }` in `user:{userId}:feeds`, or
  the list will show stale data. The existing comment at `feeds.ts:62`
  ("Keep this denormalized shape in sync with any future feed update path")
  flags this — keep it.
- Reviewer should scrutinize that legacy string entries are still handled (the
  migration is not complete until all users' lists are objects).
- Deferred: a one-time migration to rewrite all string entries to objects and
  drop the fallback branch entirely. Out of scope here.
