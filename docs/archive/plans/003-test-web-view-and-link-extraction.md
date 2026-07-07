# Plan 003: Add test coverage for the web-view render path and web-view link extraction

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 917b4bc..HEAD -- src/routes/viewer.ts src/lib/patterns.ts` If either file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `917b4bc`, 2026-06-11

## Why this matters

`handleWebView` (`src/routes/viewer.ts`) renders stored newsletter HTML into a public web page — the single most XSS-sensitive output in the app. It injects `email.html` (sanitized at ingestion) and several escaped fields (`subject`, `from`, `webViewLink`) directly into a server-built HTML string, and sets a strict Content-Security-Policy. None of this is tested. `extractWebViewLink` (`src/lib/patterns.ts`), which decides what "View original" link gets surfaced, is also untested. Both are pure-ish functions that are cheap to test and easy to break: a regression in escaping, in the feed-ownership check, or in the CSP header would ship silently today.

This plan adds focused tests that lock in the current security-relevant behavior so future refactors can't quietly weaken it. **No production code changes.**

## Current state

- `src/routes/viewer.ts` — `handleWebView(env, feedId, emailId)` returns a `Response`. Key behaviors to lock in:  
  - Returns **404** (`new Response("Email not found", { status: 404 })`) when `email:${emailId}` is missing (`viewer.ts:25-28`).  
  - Returns **404** when the email exists but `email.feedId !== feedId` (`viewer.ts:32-35`) — this is the access-control check.  
  - Escapes `subject`, `from`, and `webViewLink` via `escapeHtml` (`viewer.ts:5-12`, used at lines 53, 115, 117, 119).  
  - Injects `email.html` **unescaped** into `<main>` (`viewer.ts:123`) — by design, because it was sanitized at ingestion; the page relies on the CSP as a second layer.  
  - Sets these response headers (`viewer.ts:131-141`): `content-type: text/html; charset=utf-8`, a `content-security-policy` containing `script-src 'none'`, `x-content-type-options: nosniff`, `x-frame-options: DENY`.

  The escape function (`viewer.ts:5-12`):
  ```ts
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  ```

- `src/lib/patterns.ts` — `extractWebViewLink(html): string | undefined`. Scans anchors via `ANCHOR_REGEX` and returns the first `href` whose link text matches one of `LINK_TEXT_PATTERNS` (e.g. /view.../browser/, /view online/, /web version/), but only for `http://`/`https://` hrefs. Returns `undefined` when nothing matches. The regexes (`patterns.ts:2-19`):
  ```ts
  const LINK_TEXT_PATTERNS = [
    /view.{0,15}(in|this).{0,15}browser/i,
    /view.{0,15}online/i,
    /web.{0,15}version/i,
    /read.{0,15}(in|on).{0,15}browser/i,
    /having.{0,20}trouble.{0,20}viewing/i,
    /click.{0,15}here.{0,15}(to\s+)?view/i,
    /view.{0,15}email.{0,15}(in|on).{0,15}browser/i,
  ];
  const ANCHOR_REGEX = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  ```
  Note `ANCHOR_REGEX` is a module-level `/g` regex; `extractWebViewLink` resets `lastIndex = 0` at the start — tests calling it repeatedly should still be independent, but be aware of this if you add a stateful-looking case.

- Test harness: `src/test/utils.ts` exports `createMockEnv()` (a `Map`-backed mock KV at lines 22-86). `handleWebView` only needs `env.DATA` and `env.APP_BASE_URL`, both provided by `createMockEnv`. Model new route tests on `src/test/webhook.routes.test.ts` (it seeds `env.DATA` then calls a handler and asserts on the `Response`).

- Conventions: vitest `globals: true` (use `describe`/`it`/`expect` without imports if other tests do — check `src/test/sanitize.test.ts`, which imports them explicitly; match the file you create). Tabs + double quotes.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `bun install`      | exit 0              |
| Typecheck | `bun run typecheck`| exit 0, no errors   |
| Tests     | `bun run test`     | all pass            |
| Lint      | `bun run lint`     | exit 0              |

> **Lint note**: `bun run lint` (Biome) passes cleanly on the current tree. After adding your files it must still exit 0.

## Scope

**In scope** (create only):  
- `src/test/viewer.routes.test.ts` (create)  
- `src/test/patterns.test.ts` (create)

**Out of scope** (do NOT modify):  
- `src/routes/viewer.ts` and `src/lib/patterns.ts` — this is a characterization-test plan. If a test reveals a bug, STOP and report it; do not fix it here.  
- Any other test file.

## Git workflow

- Branch: `advisor/003-viewer-patterns-tests`
- Commit style: conventional commits (e.g. `test(viewer): cover web-view render and access control`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Test `extractWebViewLink` (`src/test/patterns.test.ts`)

Import `extractWebViewLink` from `../lib/patterns.ts`. Cover:
- Anchor whose text matches "View in browser" → returns its `href`.
- Anchor whose text matches "View online" / "Web version" → returns `href` (one case each, proving multiple patterns work).
- `href` present but text matches nothing (e.g. "Unsubscribe") → `undefined`.
- Matching text but non-http href (e.g. `mailto:` or `javascript:`) → `undefined` (the `http(s)` guard).
- Empty string / HTML with no anchors → `undefined`.
- First matching anchor wins when several match.

**Verify**: `bun run test 2>&1 | grep -E "patterns.test"` → present and passing.

### Step 2: Test `handleWebView` happy path + escaping (`src/test/viewer.routes.test.ts`)

Import `handleWebView` from `../routes/viewer.ts` and `createMockEnv` from `./utils.ts`. Seed an email into `env.DATA` under `email:${emailId}` as a JSON `StoredEmail` (shape in `src/types.ts:16-26`: `feedId`, `from {name,email}`, `html`, `id`, `subject`, `text`, `timestamp`, optional `webViewLink`).

Cover:
- **Happy path**: seed an email with `feedId` matching; call `handleWebView(env, feedId, emailId)`; assert `res.status === 200`, `content-type` includes `text/html`, and the body contains the (escaped) subject and the raw `email.html`.
- **CSP and security headers present**: assert the response has a `content-security-policy` header containing `script-src 'none'`, plus `x-content-type-options: nosniff` and `x-frame-options: DENY`. This is the regression guard — these headers are the XSS backstop.
- **Subject escaping**: seed `subject` containing `<script>alert(1)</script>` and `"`/`'`/`&`; assert the body contains the escaped form (`&lt;script&gt;`) and does NOT contain the raw `<script>` substring.
- **`webViewLink` escaping**: seed a `webViewLink` containing a `"` and assert it appears escaped inside the `href="..."` (no attribute-breaking raw quote).

### Step 3: Test `handleWebView` access control

- **Missing email**: do not seed anything; call with a random `emailId`; assert `res.status === 404`.
- **Feed mismatch**: seed an email with `feedId: "feed-A"`; call `handleWebView(env, "feed-B", emailId)`; assert `res.status === 404`. This is the ownership check — a regression here would leak emails across feeds.

**Verify**: `bun run test 2>&1 | grep -E "viewer.routes.test|Test Files|Tests"` → new file present, all tests pass.

## Test plan

- Two new files, cases enumerated in Steps 1–3.
- Structural pattern: `src/test/webhook.routes.test.ts` (route handler + mock env) and `src/test/sanitize.test.ts` (pure-function assertions).
- The load-bearing tests are: the CSP-header guard, the subject-escaping guard, and the feed-mismatch 404 — these protect the three ways this endpoint could become an XSS or data-leak vector.
- Verification: `bun run test` → all pass; total test count rises by the number of new tests (~14+).

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0; `src/test/viewer.routes.test.ts` and `src/test/patterns.test.ts` exist and pass
- [ ] viewer tests include an assertion that the CSP header contains `script-src 'none'`
- [ ] viewer tests include a feed-mismatch case asserting 404
- [ ] `git status --porcelain` shows only the two new test files
- [ ] `bun run lint` exits 0
- [ ] `plans/README.md` status row for 003 updated to DONE

## STOP conditions

Stop and report back (do NOT fix in this plan) if:
- A test reveals `handleWebView` returning 200 for a feed mismatch, or emitting the raw subject without escaping, or missing the CSP header — that is a real bug; report it with the failing assertion.
- `extractWebViewLink` returns a `javascript:`/`mailto:` href for matching text — report it (the http-guard would be broken).
- The "Current state" excerpts don't match the live files (drift).

## Maintenance notes

- These are characterization tests: they encode current behavior, including the deliberate choice to inject `email.html` unescaped behind the CSP. If a future change tightens that (e.g. re-sanitizing at render time), update these tests to match the new contract intentionally.
- Reviewer should confirm no production file was modified (`git status`).
- Deferred: fuzz/property testing of the HTML sanitizer↔viewer coupling is a larger effort and out of scope.
