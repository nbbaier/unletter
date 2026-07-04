# D1 Database Migration

**Category:** Architecture
**Quarter:** Q2
**T-shirt Size:** L

## Why This Matters

Cloudflare KV is excellent for simple key-value storage with global replication, but it has limitations that will constrain Unletter's growth:

1. **No querying**: Can't efficiently search newsletters, filter by date, or sort by multiple criteria
2. **No relationships**: Feed-to-email relationships require manual index maintenance
3. **No transactions**: Multi-step operations (like deleting a feed and its emails) risk inconsistency
4. **No aggregations**: Can't compute stats like unread counts without reading all records
5. **List limitations**: `KV.list()` returns max 1000 keys and requires pagination

D1 is Cloudflare's SQLite-at-the-edge database. It provides SQL querying, proper indexes, transactions, and efficient aggregations—all with edge-local reads. Migrating to D1 unlocks features that are otherwise impossible or impractically slow.

## Current State

All data lives in two KV namespaces:
- `WAITLIST`: Simple email-to-metadata mapping
- `DATA`: All application data with key prefixes:
  - `user:{id}` - User profiles
  - `user:email:{email}` - Email-to-ID lookup
  - `user:{id}:feeds` - Array of feed IDs
  - `feed:{id}` - Feed metadata
  - `feed:{id}:emails` - Array of email IDs
  - `email:{id}` - Full email content

**N+1 Query Problem**: Generating a feed requires reading the feed, then the email ID list, then each email individually (`src/worker.ts:556-562`). For 50 newsletters, that's 52 KV reads per request.

## Proposed Future State

A D1 database with a proper relational schema:

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Feeds table with foreign key
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  email_address TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

-- Emails table with full-text search
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  subject TEXT NOT NULL,
  from_address TEXT NOT NULL,
  html TEXT,
  text_content TEXT,
  web_view_link TEXT,
  received_at INTEGER NOT NULL
);

-- Full-text search index
CREATE VIRTUAL TABLE emails_fts USING fts5(subject, text_content, content=emails);

-- Indexes for common queries
CREATE INDEX idx_feeds_user ON feeds(user_id);
CREATE INDEX idx_emails_feed ON emails(feed_id);
CREATE INDEX idx_emails_received ON emails(received_at DESC);
```

Feed generation becomes a single SQL query:
```sql
SELECT * FROM emails WHERE feed_id = ? ORDER BY received_at DESC LIMIT 50;
```

Search across newsletters:
```sql
SELECT * FROM emails_fts WHERE emails_fts MATCH 'search term' ORDER BY rank;
```

## Key Deliverables

- [ ] Design D1 schema with proper indexes and constraints
- [ ] Set up D1 database in Alchemy configuration
- [ ] Create migration scripts for existing KV data
- [ ] Build database access layer with prepared statements
- [ ] Migrate user management to D1
- [ ] Migrate feed management to D1
- [ ] Migrate email storage to D1 (largest migration)
- [ ] Implement full-text search for newsletter content
- [ ] Update all route handlers to use D1 instead of KV
- [ ] Add database tests with in-memory SQLite
- [ ] Create rollback plan in case of migration issues
- [ ] Benchmark performance improvements (before/after)
- [ ] Keep KV for caching layer if beneficial

## Prerequisites

- **Test Suite (Initiative 01)**: Need tests to validate migration correctness
- **Security Hardening (Initiative 02)**: SQL injection prevention review

## Risks & Open Questions

- D1 is still evolving—some features may be limited
- Migration requires downtime or careful dual-write strategy
- How do we handle users with hundreds/thousands of newsletters?
- Should we keep KV as a caching layer in front of D1?
- D1 has size limits per database—what's our scale ceiling?
- Full-text search performance at scale needs testing
- What's the backup/export strategy for D1 data?

## Notes

The architecture document (`ARCHITECTURE.md`) already mentions D1 as the intended storage solution. The KV approach was likely chosen for MVP speed.

D1 supports Cloudflare's `prepare()` API for parameterized queries, which prevents SQL injection. All queries should use this pattern.

Consider using an ORM like Drizzle (lightweight, TypeScript-first) to improve developer experience and type safety.
