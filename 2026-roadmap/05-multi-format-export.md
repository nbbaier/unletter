# Multi-Format Export

**Category:** New Feature
**Quarter:** Q2
**T-shirt Size:** M

## Why This Matters

RSS feeds are the core output, but they're not the only way people want to consume long-form content. Many users want to:
- Read newsletters on e-readers (Kindle, Kobo, Remarkable)
- Archive newsletters as PDFs for reference
- Listen to newsletters during commutes
- Save to read-later apps (Pocket, Instapaper, Readwise)

By offering multiple export formats, Unletter becomes a universal newsletter hub—the place where newsletters arrive and then flow to wherever users actually consume content. This dramatically increases the value proposition beyond "RSS feed generator."

## Current State

- RSS 2.0 and Atom 1.0 feeds are generated (`src/worker.ts:569-600`)
- Individual email web view exists (`/feeds/:id/view/:email-id`)
- No export functionality beyond RSS/Atom
- No integration with third-party reading services
- Newsletter HTML is stored as-is without any transformation

## Proposed Future State

Users can export their newsletters in multiple formats:

**Document Formats:**
- **PDF**: Clean, printable versions of newsletters with consistent styling
- **ePub**: E-reader compatible format for Kindle, Kobo, etc.
- **Markdown**: Plain text version for note-taking and archival

**Integrations:**
- **Read-later Services**: One-click send to Pocket, Instapaper, Readwise
- **Audio**: AI-generated audio versions of newsletters (TTS)
- **Email Forward**: Forward cleaned newsletters to a different address

**Digest Options:**
- **Daily/Weekly Digest**: Combine multiple newsletters into a single document
- **OPML Export**: Export feed list for backup or migration

The web view becomes a hub with "Export as..." options. Power users can set up automatic exports to their preferred services.

## Key Deliverables

- [ ] Implement PDF generation for individual newsletters (using Puppeteer or similar)
- [ ] Implement ePub generation with proper formatting
- [ ] Implement Markdown extraction from HTML
- [ ] Build "Export" button component for web view
- [ ] Create API endpoints for each export format
- [ ] Integrate with Pocket API for one-click save
- [ ] Integrate with Instapaper API
- [ ] Integrate with Readwise API
- [ ] Implement TTS audio generation (OpenAI TTS or similar)
- [ ] Build digest generation (combine newsletters by date range)
- [ ] Create scheduled digest exports (daily/weekly)
- [ ] Implement OPML import/export for feed management
- [ ] Add export preferences to user settings
- [ ] Track export analytics (which formats are popular)

## Prerequisites

- **User Dashboard (Initiative 03)**: UI needed for export options and preferences
- **D1 Database (Initiative 04)**: Efficient querying for digest generation

## Risks & Open Questions

- PDF/ePub generation may need external services (Workers have CPU limits)
- How do we handle newsletters with complex layouts in ePub?
- TTS generation costs money per character—pricing implications?
- Rate limits on third-party APIs (Pocket, Instapaper)
- How do we clean newsletter HTML for audio (remove ads, navigation)?
- Should digest generation be a premium feature?
- Legal considerations for TTS of copyrighted newsletter content?

## Notes

Cloudflare Workers have a 50ms CPU limit (128MB upgrade available), which may not be enough for PDF generation. Options:
1. Use Cloudflare Browser Rendering API (preview)
2. Offload to an external PDF service
3. Use Durable Objects for longer processing

The "view in browser" link extraction in `src/lib/patterns.ts` could be extended to extract other useful content (unsubscribe links, author info, etc.).

Readwise integration is particularly valuable—many newsletter readers use it for highlights and spaced repetition.
