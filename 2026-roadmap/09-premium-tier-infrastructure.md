# Premium Tier & Monetization

**Category:** Architecture
**Quarter:** Q3
**T-shirt Size:** L

## Why This Matters

Unletter needs a sustainable business model. Running edge infrastructure, storing newsletter content, processing AI features, and developing new functionality all cost money. Without revenue, the project depends on external funding or burns through savings.

Premium tiers serve three purposes:
1. **Revenue**: Cover costs and fund development
2. **Prioritization**: Signal which features matter most to paying users
3. **Commitment**: Paying users are more engaged and provide better feedback

The key is finding the right balance—enough value in free tier to drive adoption, enough value in premium to drive conversion.

## Current State

- No monetization infrastructure
- No payment processing integration
- No concept of user tiers or limits
- All features are implicitly free
- No usage tracking or limits enforcement
- No billing UI or subscription management

## Proposed Future State

A sustainable freemium model:

**Free Tier:**
- Up to 5 feeds
- Standard RSS/Atom output
- Web view for newsletters
- Basic search (keyword only)
- 30-day email retention
- Community support

**Pro Tier ($8/month or $72/year):**
- Unlimited feeds
- AI summaries and highlights
- Semantic search
- Unlimited retention
- Export to PDF/ePub
- Priority email support
- Custom feed domains (yourname.unletter.app)

**Team Tier ($20/month per seat):**
- Everything in Pro
- Shared feeds across team
- Team analytics
- Admin controls
- SSO integration
- Dedicated support

**Infrastructure:**
- Stripe for payment processing
- Usage tracking for limits enforcement
- Billing portal for subscription management
- Upgrade prompts at limit boundaries
- Grandfathered early adopters on lifetime plans

## Key Deliverables

- [ ] Design tier structure and pricing
- [ ] Integrate Stripe for payment processing
- [ ] Build subscription management APIs
- [ ] Implement usage tracking (feed count, API calls, storage)
- [ ] Create limits enforcement middleware
- [ ] Build upgrade prompts and paywall UI
- [ ] Design billing portal (subscription management, invoices)
- [ ] Implement Stripe webhooks for subscription events
- [ ] Handle payment failures and dunning emails
- [ ] Create grandfathering for waitlist/early users
- [ ] Build team/organization model for Team tier
- [ ] Implement SSO for Team tier (SAML, OIDC)
- [ ] Add usage analytics dashboard
- [ ] Create pricing page for marketing site
- [ ] Implement trial period (14 days Pro)
- [ ] Build referral program infrastructure
- [ ] Handle proration for upgrades/downgrades
- [ ] Tax handling (Stripe Tax or similar)

## Prerequisites

- **User Dashboard (Initiative 03)**: Billing UI needs to live somewhere
- **D1 Database (Initiative 04)**: Usage tracking requires efficient storage

## Risks & Open Questions

- What's the right pricing? $8/mo competitive with newsletter tools?
- Free tier limits: 5 feeds enough to hook users but encourage upgrade?
- How do we handle users who hit limits? Hard wall or soft nudge?
- Annual vs. monthly: How aggressive on annual discount?
- Team tier: Is there demand for team newsletter reading?
- Stripe fees: 2.9% + $0.30 per transaction
- What about crypto payments or alternative payment methods?
- How do we handle refunds and disputes?
- Should AI features be separate add-on or bundled in Pro?
- Early adopter pricing: Lifetime deal or just discounted first year?

## Notes

Stripe is the obvious choice for payments—great APIs, well-documented, handles global payments. Consider:
- Stripe Billing for subscriptions
- Stripe Tax for tax compliance
- Stripe Customer Portal for self-service

Usage tracking can use D1 with a simple table:
```sql
CREATE TABLE usage (
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL, -- 'feed_count', 'ai_calls', etc.
  value INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, metric)
);
```

Grandfathering strategy:
- Waitlist signups before launch: Lifetime Pro
- First 100 paying customers: 50% lifetime discount
- First 1000: 25% first-year discount
