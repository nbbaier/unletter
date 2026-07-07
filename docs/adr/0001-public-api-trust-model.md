# ADR-0001: Public API trust model — Bearer tokens with wildcard CORS, public non-enumerable permalinks

- **Status**: Accepted
- **Decided**: 2026-06-11 (improve-skill audit adjudication); recorded 2026-07-06
- **Area**: API surface (`src/worker.ts`, `src/routes/`)

## Context

Security reviews repeatedly flag two properties of the API as findings:
1. Every API response carries `access-control-allow-origin: *`.
2. Feed and email pages (`GET /feeds/:feedId`, `/feeds/:feedId/rss`, `/feeds/:feedId/atom`, `/feeds/:feedId/view/:emailId`) are readable without authentication, and feed IDs are 10-character nanoids.

The 2026 roadmap proposed tightening CORS, adding CSRF tokens, and lengthening feed IDs to `nanoid(21)`. The June 2026 audit evaluated and rejected all three.

## Decision

- **Authentication is Bearer-token only; there is no cookie auth.** A browser making a cross-origin request to this API gains no ambient authority, so wildcard CORS grants nothing an attacker couldn't do with `curl`. CSRF tokens protect cookie-authenticated endpoints; this app has none. Wildcard CORS is intentional and stays.
- **Feed and email URLs are shareable permalinks by design.** The product contract is "your feed URL works in any RSS reader without credentials." Access control is capability-based: possession of the URL. IDs are nanoids (default 64-char alphabet; 10 chars ≈ 1.2×10^18 combinations), which are not enumerable in practice. Lengthening them adds entropy nobody can brute-force through a rate-limited public endpoint anyway.

## Consequences

- Do not re-file CORS tightening, CSRF protection, or feed-ID lengthening as issues without new evidence (e.g. cookie-based auth being introduced — which would reopen **all** of this ADR).
- Anything that must stay private cannot be protected by URL secrecy alone; if a private-feeds feature is ever built, it needs real authorization, not longer IDs.
- Rate limiting on public endpoints is part of what makes non-enumerable IDs sufficient — see ADR-0004.
