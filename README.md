# unletter

[![Deployed with Alchemy](https://alchemy.run/alchemy-badge.svg)](https://alchemy.run)

Turn email newsletters into RSS feeds.

## Current Status

Landing page with email signup for waitlist. The conversion service is in development.

## Vision

A newsletter-to-RSS conversion service that addresses limitations of existing solutions:
- Persistent storage (feeds don't disappear)
- User dashboards for feed management  
- Broad newsletter format compatibility
- Clean, editorial design

## Tech Stack

- Cloudflare Workers
- Alchemy for infrastructure
- TypeScript

## Development
```bash
bun install
bun run dev    # Local development
bun run deploy # Deploy to Cloudflare
