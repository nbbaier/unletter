# Comprehensive Test Suite

**Category:** Testing
**Quarter:** Q1
**T-shirt Size:** M

## Why This Matters

Unletter currently has **zero tests**. This is a critical risk for a service that handles user authentication, email content, and webhook integrations. Without tests, every deployment is a gamble. Every refactor risks breaking core functionality. Every new contributor faces fear of introducing regressions.

A comprehensive test suite transforms development velocity. It enables confident refactoring, validates security controls, catches regressions before users do, and serves as living documentation of expected behavior. For a privacy-focused service handling user newsletters, testing isn't optional—it's table stakes.

## Current State

-  No test files exist anywhere in the codebase
-  No testing framework is installed or configured
-  Bun's native testing capability is available but unused
-  Miniflare (v4) is installed for local development but not used for testing
-  All testing is manual: deploy and check if it works

## Proposed Future State

Every PR triggers an automated test pipeline that validates:

-  **Unit tests** for all utility functions (auth, patterns, escaping)
-  **Integration tests** for every API route with mocked Cloudflare bindings
-  **Security tests** specifically validating auth flows, token handling, and XSS prevention
-  **Webhook payload tests** covering various email providers' formats
-  **Feed generation tests** ensuring valid RSS/Atom output
-  **Snapshot tests** for web view HTML rendering

Coverage reports are generated and tracked. New features require tests. The team has confidence that if tests pass, production won't break.

## Key Deliverables

-  [ ] Install and configure Vitest (or Bun test runner) with Miniflare integration
-  [ ] Create test utilities: mock KV, mock env, test fixtures for email payloads
-  [ ] Unit tests for `src/lib/auth.ts` (password hashing, JWT creation/verification)
-  [ ] Unit tests for `src/lib/patterns.ts` (link extraction patterns)
-  [ ] Integration tests for auth routes (signup, login, token validation)
-  [ ] Integration tests for feed routes (create, list, delete, access control)
-  [ ] Integration tests for webhook endpoint (payload parsing, storage)
-  [ ] Integration tests for feed generation (RSS/Atom validity)
-  [ ] Integration tests for web view (HTML rendering, escaping)
-  [ ] Security-focused tests (auth bypass attempts, XSS vectors, malformed input)
-  [ ] CI pipeline configuration (GitHub Actions) with test runs on every PR
-  [ ] Coverage reporting with minimum threshold (80%+)
-  [ ] Test documentation in TESTING.md

## Prerequisites

None - this is foundational work that should happen first.

## Risks & Open Questions

-  Miniflare may have quirks that don't match production Cloudflare behavior
-  Mocking KV storage accurately requires careful fixture design
-  Should we use snapshot testing for feed output, or explicit assertions?
-  How do we test webhook payloads from inbound.new without access to real samples?

## Notes

The `wrangler.jsonc` and Miniflare installation suggest this was always intended to have tests. The Phase 1 MVP push likely deprioritized testing to ship faster. Now is the time to backfill.

Key files that need test coverage:

-  `src/worker.ts:95-127` - Waitlist signup validation
-  `src/worker.ts:170-245` - Auth flows
-  `src/worker.ts:466-529` - Webhook processing
-  `src/lib/auth.ts` - All functions are security-critical
-  `src/lib/patterns.ts` - Regex pattern matching
