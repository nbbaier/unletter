# ADR-0004: Rate limiting via Durable Objects, not KV counters

- **Status**: Accepted
- **Decided**: ~2026-02 (DurableRateLimiter introduction); recorded 2026-07-06
- **Area**: `src/durable-objects/rate-limiter.ts`, `src/lib/rate-limit.ts`

## Context

Auth endpoints (signup 3/hr, login 5/min) and the waitlist need per-IP rate limiting. The first implementation counted requests in KV. KV is eventually consistent and has no atomic read-modify-write, so concurrent requests could read the same counter value and both pass — the limiter leaked exactly when it was needed (bursts). Cloudflare's platform answer to "small strongly-consistent counter" is a Durable Object, which serializes access per object instance.

## Decision

Enforce rate limits in a **Durable Object** (`RateLimiterDO`), one instance per `{purpose}:{ip}` key (purpose prefixes: `signup:`, `login:`, `waitlist:`), using transactional storage for the counter. Callers go through the `DurableRateLimiter` client wrapper. Allowed limit configurations are server-side validated (`ALLOWED_CONFIGS`) so a caller cannot request a weaker limit.

The KV-based `RateLimiter` class is deprecated dead code; its removal is tracked as issue #37.

## Consequences

- Rate-limit checks cost a DO hop per guarded request. Acceptable on low-volume auth/waitlist endpoints; a future high-volume public API (roadmap initiative 10) should measure before reusing this path unchanged.
- Rate-limit state is strongly consistent but per-colo DO placement means limits are global per key, not per edge location — that is the intended semantics.
- The DO's alarm-based cleanup has a known window-size bug tracked as issue #36; fixing it does not change this decision.
- New endpoints needing rate limiting should reuse `DurableRateLimiter` with a new purpose prefix and an entry in `ALLOWED_CONFIGS` — not a new mechanism.
