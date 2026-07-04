# unletter - Architecture & Design Decisions

## Project Overview

**unletter** is a newsletter-to-RSS conversion service that addresses limitations of existing solutions like Kill the Newsletter. The service converts email newsletters into RSS feeds, allowing users to read newsletters in their preferred feed reader while maintaining clean inboxes and privacy.

**Core Value Propositions:**

-  Persistent storage (feeds don't disappear when old entries are removed)
-  User dashboards for centralized feed management
-  Ability to recover/regenerate lost feeds
-  Broad compatibility across newsletter platforms (Substack, Beehiiv, Ghost, etc.)
-  Privacy-first approach

**Target Users:** People who want to consolidate newsletter reading in RSS readers without inbox clutter.

---

## Technical Stack

### Platform: Cloudflare Workers Ecosystem

**Rationale:** Already invested in Cloudflare infrastructure, provides serverless compute, edge distribution, and generous free tier.

**Components:**

-  **Cloudflare Workers** - Serverless compute for all backend logic
-  **Cloudflare KV** - Fast edge-replicated storage for hot path data
-  **Cloudflare D1** - SQL database for user management and analytics
-  **Cloudflare Assets** - Static file hosting for landing page
-  **Alchemy** - Infrastructure as Code for deployment

### Language & Runtime

-  **TypeScript** - Type-safe development
-  **Bun** - JavaScript runtime and package manager

---

## Architecture Decisions

### 1. Email Reception Strategy

**Decision:** Use **inbound.new** for email reception via webhook (similar to Email-to-RSS approach)

**Alternatives Considered:**

-  Running own SMTP server (Kill the Newsletter approach)
-  ForwardEmail.net

**Rationale:**

-  Avoids complexity of managing SMTP server infrastructure
-  No need to handle MX records, spam filtering, etc.
-  Webhook-based integration is simpler and more reliable
-  Already familiar with inbound.new
-  Works seamlessly with Cloudflare Workers

**How it works:**

1. Newsletter arrives at `{identifier}@unletter.app`
2. inbound.new receives email and POSTs to Worker webhook endpoint
3. Worker validates webhook, parses email, stores in KV
4. Feed metadata updated in both KV and D1

---

### 2. Storage Architecture: Hybrid KV + D1

**Decision:** Use **hybrid storage** with KV for hot path, D1 for management/analytics

#### KV Storage (Hot Path - Speed Critical)

**Use cases:**

-  RSS feed generation (needs edge speed)
-  Email content storage (large blobs, simple lookups)
-  Pattern library for web view link extraction
-  Feed metadata for quick access

**Key structure:**

```
feed:{feed-id}:meta -> { name, created, email_address, user_id }
feed:{feed-id}:emails -> [array of email IDs]
email:{email-id} -> { subject, html, text, timestamp, links, ... }
patterns:global -> [regex patterns array]
patterns:feed:{feed-id} -> [feed-specific patterns]
user:{user-id}:feeds -> [array of feed IDs]
```

#### D1 Storage (Analytics & Management)

**Use cases:**

-  User authentication and account management
-  Feed relationship mapping (user -> feeds)
-  Analytics and statistics
-  Complex queries (search, filtering, aggregation)

**Schema outline:**

```sql
users (id, email, password_hash, created_at, updated_at)
feeds (id, user_id, name, email_address, created_at, last_email_at)
feed_stats (feed_id, total_emails, total_views, last_updated)
patterns (id, regex, source, success_count, created_at, feed_id)
```

**Rationale:**

-  KV provides <10ms edge reads for RSS feed serving
-  D1 enables complex dashboard queries without compromising feed performance
-  Can add D1 analytics later without refactoring core feed serving
-  KV free tier (100k reads/day) perfect for RSS polling patterns
-  D1 better for relational user/feed data

---

### 3. RSS Feed Generation: Dynamic vs Static

**Decision:** **Dynamic feed generation** on request

**Alternative:** Pre-generate and store static XML files (Kill the Newsletter approach)

**Rationale:**

-  Workers are extremely fast (<50ms total response time)
-  Enables flexible features:
   -  Query parameters (`?limit=10`, `?since=timestamp`)
   -  Future filtering options
   -  Easy to modify feed format without migration
-  No feed size limits to manage
-  Infrequent polling (RSS readers check every 15-60min) means compute cost is minimal
-  Can add edge caching with `Cache-Control` headers if needed

**Implementation:**

```typescript
// On GET /feeds/{feed-id}/rss
1. Fetch feed metadata from KV
2. Fetch email list from KV
3. Build RSS XML from data
4. Return with appropriate Cache-Control headers
```

---

### 4. Feed Entry Links Strategy

**Decision:** Provide **both** unletter web view AND original newsletter web version

**Link hierarchy:**

1. **Primary (`<link rel="alternate">`)**: `https://unletter.app/feeds/{feed-id}/view/{email-id}`
2. **Original (`<link rel="via">`)**: `https://newsletter.com/web/12345` (if detected)

**Rationale:**

-  unletter web view provides persistent, shareable permalinks
-  Original web version enables access to interactive features, comments, tracking
-  Fallback chain ensures users always have a way to view content
-  Web view is trivial to implement (render stored HTML in clean layout)

**Web View Link Extraction:**

**Strategy:** Progressive pattern matching with LLM fallback

```typescript
1. Try known regex patterns (fast, free)
2. If not found, use LLM extraction (costs pennies)
3. Learn from LLM success, generate and store new pattern
4. Pattern library grows smarter over time
```

**Pattern storage:**

-  Global patterns (work across all newsletters)
-  Feed-specific patterns (Substack always uses X format)
-  Pattern metadata (success count, last seen, source)

**Detection patterns:**

```regex
/view.{0,10}(in|this).{0,10}browser/i
/view.{0,10}online/i
/web.{0,10}version/i
/having trouble.{0,20}viewing/i
/read.{0,10}(in|on).{0,10}browser/i
```

**Benefits:**

-  Cost-effective (most emails hit cached patterns)
-  Self-improving system without manual work
-  Feed-aware (learns newsletter-specific patterns)
-  Privacy-friendly (analyzing structure, not content)

---

### 5. Email Parsing & Storage

**Decision:** Store both HTML and extracted text, parse on ingestion

**Email data model:**

```typescript
{
  id: string;
  feedId: string;
  subject: string;
  from: { name: string; email: string };
  html: string;           // Full HTML for web view
  text: string;           // Plain text fallback
  timestamp: string;      // ISO 8601
  links: {
    webView?: string;     // Extracted "view in browser" link
    unsubscribe?: string; // For future feature
  };
  metadata: {
    userAgent?: string;
    size: number;
  };
}
```

**Parsing approach:**

-  Use lightweight email parser (avoid heavy Node.js dependencies)
-  Extract subject, from, HTML body, text body
-  Detect and extract web view link (see pattern strategy above)
-  Sanitize HTML for security (prevent XSS in web views)

---

### 6. Feed Generation Format

**Decision:** Support both **RSS 2.0** and **Atom** feeds

**Rationale:**

-  Different readers have different preferences
-  Atom is more modern, better namespace support
-  RSS 2.0 has wider compatibility
-  Minimal extra work to support both

**URL structure:**

```
/feeds/{feed-id}/rss   -> RSS 2.0
/feeds/{feed-id}/atom  -> Atom
/feeds/{feed-id}       -> Defaults to RSS 2.0
```

---

## Development Priorities

### Phase 1: Core Conversion MVP

1. ✅ Landing page with waitlist
2. Email webhook endpoint (inbound.new integration)
3. Email parsing and storage (KV)
4. RSS feed generation (dynamic, KV-backed)
5. Basic web view for individual emails

### Phase 2: User Management

1. User authentication (D1)
2. User dashboard
3. Feed management UI (create, view, delete)
4. Feed statistics

### Phase 3: Enhanced Features

1. Pattern library UI (view learned patterns)
2. Email search within feeds
3. Feed settings (filters, limits)
4. Reply support for interactive newsletters

---

## Design Philosophy

**Editorial Aesthetic:**

-  Crimson Pro serif for headlines
-  Work Sans for body text
-  Warm orange accent color (#d84315)
-  Paper-like grain texture
-  Clean, minimal UI
-  Focus on readability

**Principles:**

-  Prioritize simplicity over features
-  Respect user privacy (no tracking)
-  Maintain data persistence (never delete user content without permission)
-  Broad compatibility (support all newsletter platforms)
-  Fast, reliable service (leverage edge computing)

---

## Business Model

**Current:** Likely completely free

**Considerations:**

-  Market research suggests $3-8/month viable for freemium
-  Free tier could have limits (X feeds, Y emails per feed)
-  Paid tier adds unlimited feeds, search, analytics
-  Decision pending based on costs and market validation

---

## Open Questions

1. **Pattern learning UI:** Should users see/edit learned patterns?
2. **Email retention:** Keep all emails forever or implement cleanup policy?
3. **Feed sharing:** Should feeds be public, private, or shareable via token?
4. **Export features:** Allow users to export their feeds/emails?
5. **Webhook reliability:** How to handle inbound.new downtime/failures?

---

## Competitive Landscape

**Free Standalone Converters:**

-  Kill the Newsletter (domain blocking issues, no persistence)
-  Email-to-RSS (requires self-hosting)

**Integrated RSS Reader Features:**

-  Feedbin, Inoreader ($5-6/month, full feed reader)

**Platform-Native RSS:**

-  Inconsistent support across newsletter platforms

**unletter positioning:** Free/low-cost specialized converter with persistence and broad compatibility, positioned between unreliable free tools and expensive full readers.

---

## References

### Kill the Newsletter Architecture

-  Runs own SMTP server (Node.js)
-  Static Atom feed files on filesystem
-  Deletes old entries to manage file size
-  No database needed
-  Self-contained binary deployment

### Email-to-RSS Architecture (yl8976)

-  ForwardEmail.net for email reception
-  Cloudflare Worker webhook endpoint
-  IP validation for security
-  Cloudflare KV storage
-  Dynamic feed generation
-  Admin UI for management
-  Hono framework + Feed library

**Key learnings applied:**

-  Webhook-based email reception (simpler than SMTP)
-  KV for storage (edge performance)
-  Dynamic feed generation (flexibility)
-  Pattern-based link extraction (automated learning)
