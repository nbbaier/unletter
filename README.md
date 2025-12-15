# unletter

[![Deployed with Alchemy](https://alchemy.run/alchemy-badge.svg)](https://alchemy.run)

Turn email newsletters into RSS feeds.

## Features

- **User Authentication** - Email/password signup and login with JWT tokens
- **Multiple Feeds** - Create separate feeds for different newsletters
- **Email Reception** - Webhook integration with inbound.new for email processing
- **RSS/Atom Generation** - Dynamic feed generation in both formats
- **Web View** - Clean, readable view for individual emails
- **Link Extraction** - Automatic detection of "view in browser" links

## How It Works

1. Sign up for an account
2. Create a feed and get a unique email address (e.g., `abc123@unletter.app`)
3. Subscribe to newsletters using that email address
4. Access your newsletters via RSS feed or web view

## Tech Stack

- **Cloudflare Workers** - Serverless compute
- **Cloudflare KV** - Edge storage for users, feeds, and emails
- **Alchemy** - Infrastructure as code
- **TypeScript** - Type-safe development
- **inbound.new** - Email reception via webhook

## API Routes

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login and get JWT

### Feeds (requires authentication)
- `POST /api/feeds` - Create a new feed
- `GET /api/feeds` - List your feeds
- `DELETE /api/feeds/{id}` - Delete a feed

### Public Endpoints
- `GET /feeds/{id}` - RSS 2.0 feed
- `GET /feeds/{id}/rss` - RSS 2.0 feed (explicit)
- `GET /feeds/{id}/atom` - Atom feed
- `GET /feeds/{id}/view/{email-id}` - Web view for an email

### Webhook
- `POST /api/webhook/inbound` - Receive emails from inbound.new

## Development

```bash
# Install dependencies
bun install

# Local development
bun run dev

# Type checking
bun run build

# Linting
bun run lint
bun run lint:fix

# Deploy to Cloudflare
bun run deploy
```

## Setup

See [SETUP.md](./SETUP.md) for deployment and configuration instructions.

## Project Structure

```
src/
├── worker.ts          # Main worker with all routes
├── types.ts           # TypeScript interfaces
├── lib/
│   ├── auth.ts        # Password hashing and JWT
│   └── patterns.ts    # Link extraction patterns
└── assets/            # Static landing page
```

## License

MIT
