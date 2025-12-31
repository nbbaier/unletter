# Security Hardening

**Category:** Security
**Quarter:** Q1
**T-shirt Size:** M

## Why This Matters

Unletter handles sensitive user data: email content, authentication credentials, and personal reading habits. A security breach would destroy user trust immediately and permanently. The current implementation has several identified vulnerabilities that must be addressed before scaling up.

The most critical issue is **XSS vulnerability in the web view**—newsletter HTML is rendered directly without sanitization. A malicious newsletter could execute arbitrary JavaScript in users' browsers. This alone makes the current system unsuitable for production traffic.

## Current State

**Critical Issues:**
1. **No HTML sanitization**: `email.html` is injected directly into web view templates (`src/worker.ts:717`). Only metadata is escaped.
2. **Simple string comparison for webhook auth**: Vulnerable to timing attacks (`src/worker.ts:466`).

**Medium Issues:**
3. No rate limiting on auth endpoints (brute force risk)
4. No CSRF protection (CORS allows `*`)
5. No Content-Security-Policy headers
6. Email validation regex too permissive
7. Feed IDs are short (10 chars) and potentially enumerable
8. No request size limits

**Low Issues:**
9. Console.log in production (potential info leakage)
10. No security headers (X-Frame-Options, X-Content-Type-Options)

## Proposed Future State

Unletter implements defense-in-depth security:

- **HTML Sanitization**: All newsletter content passes through DOMPurify or equivalent before rendering. Scripts, event handlers, and dangerous elements are stripped.
- **Rate Limiting**: Auth endpoints limited to 5 attempts/minute per IP. Waitlist signup limited to prevent abuse.
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options on all responses.
- **Input Validation**: Strict schemas for all API inputs using Zod or similar.
- **Secure Comparisons**: All token/secret comparisons use constant-time functions.
- **Audit Logging**: Failed auth attempts, admin access, and suspicious patterns logged for review.

A security review checklist runs on every PR. Dependencies are monitored for vulnerabilities.

## Key Deliverables

- [ ] Integrate DOMPurify (or similar) for HTML sanitization in web view
- [ ] Add Content-Security-Policy headers to all HTML responses
- [ ] Implement rate limiting using Cloudflare's built-in features or KV-based tracking
- [ ] Replace all secret comparisons with constant-time comparison function
- [ ] Add security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [ ] Implement request size limits for webhook payloads
- [ ] Upgrade email validation with RFC-compliant regex
- [ ] Add Zod schemas for all API input validation
- [ ] Implement audit logging for security-sensitive operations
- [ ] Create SECURITY.md documenting threat model and security practices
- [ ] Set up Dependabot or similar for dependency vulnerability monitoring
- [ ] Consider moving to longer feed IDs (nanoid(21)) for reduced enumeration risk
- [ ] Add HTTPS-only enforcement headers

## Prerequisites

None - security work should happen in parallel with testing.

## Risks & Open Questions

- DOMPurify adds bundle size (~40KB). Is there a lighter alternative for Workers?
- Rate limiting in Workers requires storage (KV or Durable Objects). What's the best approach?
- Should we implement IP-based rate limiting or token-based?
- How aggressive should HTML sanitization be? Some newsletter styling may break.
- Do we need a bug bounty program for ongoing security feedback?

## Notes

The constant-time comparison function already exists in `src/lib/auth.ts:85-95` (`timingSafeEqual`). It's used for password verification but not for webhook token comparison.

The escapeHtml function at `src/worker.ts:644-650` handles metadata but is not applied to the full HTML body. This is the core XSS vulnerability.

Reference: OWASP XSS Prevention Cheat Sheet should guide the sanitization approach.
