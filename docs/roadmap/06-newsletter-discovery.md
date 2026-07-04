# Newsletter Discovery & Directory

**Category:** New Feature
**Quarter:** Q2-Q3
**T-shirt Size:** XL

## Why This Matters

Finding good newsletters is surprisingly hard. People rely on word-of-mouth, Twitter recommendations, or stumbling upon signup forms. There's no single place to browse, discover, and evaluate newsletters before subscribing.

Unletter is uniquely positioned to solve this. We receive newsletters from across the ecosystem—we see what people are reading, which newsletters have high engagement, and what's trending. A discovery directory transforms Unletter from a utility (convert newsletters to RSS) into a destination (find your next favorite newsletter).

This is also a powerful growth engine. Users searching for newsletter recommendations land on Unletter, discover the service, and convert to users. The directory becomes organic SEO at scale.

## Current State

- No discovery features exist
- Users must already know which newsletters they want to subscribe to
- No analytics about which newsletters are popular
- No newsletter metadata beyond what's in email headers
- Landing page mentions "growing list of newsletters" but there's no list

## Proposed Future State

A curated, searchable newsletter directory:

**Browse & Discover:**
- Categories (Tech, Business, Culture, Science, Finance, etc.)
- Curated collections ("Best of 2026", "Deep Dives", "Quick Reads")
- Trending newsletters (based on new subscribers)
- Editor's picks and staff recommendations
- "Similar to..." recommendations based on reading patterns

**Newsletter Profiles:**
- Description, author info, posting frequency
- Sample issues (with permission)
- Subscriber count and growth trends
- Average read time per issue
- User ratings and reviews
- Direct subscribe-via-Unletter button

**Personalized Discovery:**
- "For You" recommendations based on existing subscriptions
- Topic preferences during onboarding
- "Readers who like X also like Y" suggestions
- Weekly discovery digest email

**Publisher Tools:**
- Claim and customize newsletter profile
- Analytics dashboard for publishers
- Promote newsletter placement (future revenue stream)

## Key Deliverables

- [ ] Design newsletter metadata schema (category, author, frequency, etc.)
- [ ] Build newsletter profile pages (public, SEO-optimized)
- [ ] Create category taxonomy and tagging system
- [ ] Implement newsletter submission flow (publishers can add their own)
- [ ] Build browse interface with filtering and search
- [ ] Implement trending algorithm based on subscription velocity
- [ ] Create recommendation engine ("similar newsletters")
- [ ] Build "For You" personalized feed using collaborative filtering
- [ ] Add rating and review system for newsletters
- [ ] Create curated collections with editorial curation tools
- [ ] Build publisher claiming and verification flow
- [ ] Design sample issue preview system (respecting copyright)
- [ ] Implement SEO optimization for all public pages
- [ ] Create newsletter discovery API for third-party use
- [ ] Build weekly discovery digest email
- [ ] Add publisher analytics dashboard

## Prerequisites

- **D1 Database (Initiative 04)**: Required for efficient querying and recommendations
- **User Dashboard (Initiative 03)**: Account system for ratings, reviews, preferences

## Risks & Open Questions

- How do we seed the directory with initial newsletter data?
- Privacy: Can we show subscriber counts without revealing individual subscriptions?
- Copyright: Can we show sample issues without newsletter permission?
- Moderation: How do we handle spam/low-quality newsletter submissions?
- Gaming: How do we prevent fake reviews or inflated subscriber counts?
- Should publishers be able to claim their newsletter profiles?
- How do we handle newsletters that don't want to be listed?
- What's the monetization angle? Promoted listings? Premium analytics?

## Notes

This is one of the highest-potential initiatives for growth. Newsletter discovery is an underserved market—existing directories are either outdated, spam-filled, or focused on specific niches.

The challenge is cold-start: we need newsletter data before we have it flowing through the system. Options:
1. Scrape existing directories (Substack explore, Beehiiv discover)
2. Manual curation of top 500 newsletters
3. Publisher outreach campaign
4. User-submitted newsletters

Privacy is paramount—we must never reveal individual user subscriptions. Aggregate data only.
