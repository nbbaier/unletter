# Developer API & Ecosystem

**Category:** Integration
**Quarter:** Q4
**T-shirt Size:** L

## Why This Matters

The most successful products become platforms. Slack, Notion, and Zapier all grew by enabling others to build on top of them. Unletter's newsletter data is valuable beyond our own interfaces—developers want to build custom dashboards, integrate with other tools, and create novel reading experiences.

A public API transforms Unletter from a product into infrastructure. Third-party integrations expand our reach without proportional development cost. API revenue provides a B2B revenue stream alongside consumer subscriptions. And developers who build on Unletter become our most passionate advocates.

## Current State

- Internal API exists but is undocumented
- No public API access or authentication
- No rate limiting infrastructure (identified as security gap)
- No API versioning strategy
- No webhooks for real-time events
- No SDK or client libraries

## Proposed Future State

A comprehensive developer platform:

**RESTful API:**
- Full CRUD for feeds and emails
- Search and filtering capabilities
- Pagination with cursor-based navigation
- Consistent error responses
- Rate limiting by tier

**Webhooks:**
- New email received
- Feed created/deleted
- Subscription events
- Customizable event filtering

**SDKs & Tools:**
- JavaScript/TypeScript SDK
- Python SDK
- Ruby SDK
- CLI tool for power users
- Postman collection
- OpenAPI specification

**Developer Experience:**
- API key management in dashboard
- Usage analytics and billing
- Interactive API documentation
- Sandbox environment for testing
- Webhook testing tools

**Integrations:**
- Zapier integration (triggers and actions)
- Make (Integromat) integration
- n8n integration
- IFTTT applets
- Shortcuts/Automator actions

## Key Deliverables

- [ ] Design API versioning strategy (URL versioning vs. header)
- [ ] Create OpenAPI specification for all endpoints
- [ ] Implement API key authentication (separate from user JWT)
- [ ] Build rate limiting with tier-based quotas
- [ ] Create interactive API documentation (Swagger UI or similar)
- [ ] Implement webhook infrastructure (delivery, retries, signing)
- [ ] Build webhook management UI in dashboard
- [ ] Create JavaScript/TypeScript SDK
- [ ] Create Python SDK
- [ ] Build CLI tool for power users
- [ ] Implement usage tracking and billing for API calls
- [ ] Create sandbox environment for testing
- [ ] Build Zapier integration (certified if possible)
- [ ] Create Postman collection
- [ ] Write API documentation with examples
- [ ] Implement API changelog and deprecation policy
- [ ] Build developer portal (separate marketing site)
- [ ] Create getting started guides and tutorials
- [ ] Implement OAuth2 for third-party app authorization

## Prerequisites

- **Premium Tier (Initiative 09)**: API billing needs subscription infrastructure
- **D1 Database (Initiative 04)**: Usage tracking and rate limiting
- **Security Hardening (Initiative 02)**: API security is critical

## Risks & Open Questions

- API versioning: How do we handle breaking changes?
- Rate limits: What's generous enough for developers but protective?
- Pricing: Per-call vs. monthly quota? Free tier for developers?
- OAuth2: Needed for third-party apps, but complex to implement
- Zapier certification: Worth the effort for visibility?
- How much API documentation is enough? (Stripe-level is gold standard)
- Do we need GraphQL or is REST sufficient?
- How do we handle webhook delivery failures?
- Should API access be Pro-only or available on free tier?

## Notes

API design principles to follow:
- Use consistent naming (snake_case vs. camelCase—pick one)
- Return useful error messages with codes
- Support both JSON and form-encoded requests
- Include request IDs for debugging
- Provide cursor pagination, not offset
- Use ISO 8601 for dates

Webhook infrastructure:
- Sign payloads with HMAC-SHA256
- Include timestamp to prevent replay attacks
- Retry with exponential backoff (3 attempts)
- Store delivery logs for debugging

The OpenAPI spec should be generated from TypeScript types using something like `ts-rest` or `zod-to-openapi` for consistency.

Consider a developer-focused pricing tier:
- API-only access at lower price point
- Generous free tier for experimentation
- Volume discounts for high-usage integrations
