# ADR-0003: Custom Workers-compatible HTML sanitizer instead of DOMPurify

- **Status**: Accepted
- **Decided**: ~2026-01 (security hardening implementation); recorded 2026-07-06
- **Area**: `src/lib/sanitize.ts`

## Context

ADR-0002 requires sanitizing newsletter HTML at ingest. The default choice for HTML sanitization in the JS ecosystem is DOMPurify, but DOMPurify requires DOM APIs (a `document`/DOM tree to parse into), which do not exist in the Cloudflare Workers runtime. Options considered: DOMPurify + a DOM shim (e.g. linkedom/jsdom — heavyweight, slow cold starts, large bundle), an HTMLRewriter-based approach, or a purpose-built whitelist sanitizer.

## Decision

Ship a **custom whitelist-based sanitizer** (`src/lib/sanitize.ts`): a parser that keeps an allowlist of tags/attributes and strips scripts, event-handler attributes, `style`, and `javascript:`/data URLs. No DOM dependency, no shim, small and synchronous — suitable for running on every inbound webhook.

## Consequences

- A hand-rolled sanitizer is a bigger correctness liability than a battle-tested library. This is mitigated by (a) the dedicated test suite (`src/test/sanitize.test.ts`) covering script/URL/malformed-input vectors, and (b) the CSP backstop from ADR-0002 — a sanitizer bypass alone does not yield script execution.
- Changes to the allowlist are security-relevant and deserve adversarial review + new test vectors, not drive-by edits.
- If the Workers runtime or ecosystem later offers a well-maintained Workers-native sanitizer with meaningful adoption, revisiting this ADR is reasonable — the switching cost is one module behind one call site.
