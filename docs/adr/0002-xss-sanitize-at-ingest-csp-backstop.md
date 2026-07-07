# ADR-0002: XSS strategy — sanitize newsletter HTML at ingest, CSP backstop at render

- **Status**: Accepted
- **Decided**: ~2026-01 (security hardening); reaffirmed by the 2026-06-11 audit; recorded 2026-07-06
- **Area**: webhook ingestion (`src/routes/webhook.ts`), web view (`src/routes/viewer.ts`), sanitizer (`src/lib/sanitize.ts`)

## Context

Inbound newsletter emails are attacker-controllable HTML that the app later renders on a public web page (`GET /feeds/:feedId/view/:emailId`) — the most XSS-sensitive surface in the system. The HTML must be cleaned somewhere: at write time (ingest), at read time (render), or both.

## Decision

**Sanitize once, at ingest; render the stored HTML unescaped behind a strict CSP.**

- The webhook handler runs `sanitizeEmailContent` on every inbound email before storing it. Script tags, event handlers, `style`, and `javascript:`/dangerous URLs are stripped at the door; only sanitized HTML ever reaches KV.
- The web view injects the stored `email.html` **unescaped** — this is deliberate, not a bug. Escaping it would destroy newsletter formatting; re-sanitizing on every render would pay the cost per read instead of per write.
- The render path carries a second, independent layer: a `content-security-policy` with `script-src 'none'`, plus `x-content-type-options: nosniff` and `x-frame-options: DENY`. Even if a sanitizer bypass stores active content, the CSP prevents it executing.
- Metadata the viewer interpolates itself (`subject`, `from`, `webViewLink`) is HTML-escaped at render, because it is placed into new markup rather than being pre-sanitized markup.

## Consequences

- The sanitizer is load-bearing at exactly one choke point (ingest). Any new write path for email HTML **must** call it; any new render surface gets the same CSP headers.
- Characterization tests (issue #35) lock in the CSP header, the escaping of interpolated fields, and the feed-ownership check — treat a change to any of those as a contract change, not a refactor.
- "Stored HTML is injected unescaped" will keep appearing in audits as a suspected XSS. It is safe only as long as both layers hold; verify the layers, don't re-litigate the design.
- The sanitizer implementation choice is ADR-0003.
