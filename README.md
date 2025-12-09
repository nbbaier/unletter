# unletter

[![Deployed with Alchemy](https://alchemy.run/alchemy-badge.svg)](https://alchemy.run)

A waitlist application built with [Alchemy](https://alchemy.run) and Cloudflare Workers. Collects email signups with metadata and provides an admin API for viewing entries.

## Tech Stack

- **Alchemy** - TypeScript-native Infrastructure as Code
- **Cloudflare Workers** - Serverless compute platform
- **Cloudflare KV** - Key-value storage for waitlist entries
- **Cloudflare Assets** - Static asset hosting
- **Bun** - JavaScript runtime and package manager
- **TypeScript** - Type-safe development

## Features

- **Waitlist Signup API** - Accept email submissions with metadata (timestamp, user agent, referrer)
- **Duplicate Detection** - Prevent duplicate email entries
- **Admin API** - View all waitlist entries with Bearer token authentication
- **Static Assets** - Serve HTML/CSS/JS from `src/assets`
- **Custom Domain** - Deployed to `unletter.app`
- **PR Previews** - Automatic preview deployments with GitHub comments

## Project Structure

```
unletter/
├── alchemy.run.ts       # Infrastructure definition
├── src/
│   ├── worker.ts        # Cloudflare Worker implementation
│   └── assets/          # Static assets (HTML, CSS, JS)
├── wrangler.jsonc       # Generated Wrangler config for local dev
└── package.json
```

## Setup

### Prerequisites

- [Bun](https://bun.sh) installed
- Cloudflare account
- Wrangler CLI authenticated (`bunx wrangler login`)

### Installation

```bash
bun install
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required for Alchemy secret encryption
ALCHEMY_PASSWORD=your-secure-password

# Admin API key (optional for local dev, required for production)
ADMIN_API_KEY=your-secret-admin-key

# Optional: For GitHub PR preview comments
PULL_REQUEST=1
GITHUB_REPOSITORY_OWNER=your-username
GITHUB_REPOSITORY_NAME=unletter
GITHUB_SHA=commit-hash
```

## Development

```bash
# Start local development server
bun run dev

# Build TypeScript
bun run build

# Check code quality
bun run lint
bun run lint:fix
```

## Deployment

```bash
# Deploy to Cloudflare
bun run deploy

# Destroy all resources
bun run destroy
```

## API Documentation

### POST /api/waitlist

Add an email to the waitlist.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Responses:**
- `201 Created` - Successfully added to waitlist
- `400 Bad Request` - Invalid email format
- `409 Conflict` - Email already on waitlist
- `500 Internal Server Error` - Server error

### GET /admin/waitlist

Retrieve all waitlist entries (requires authentication).

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_API_KEY
```

**Response:**
```json
{
  "total": 10,
  "emails": [
    {
      "email": "user@example.com",
      "timestamp": "2025-12-09T12:00:00.000Z",
      "userAgent": "Mozilla/5.0...",
      "referrer": "https://example.com"
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing API key
- `500 Internal Server Error` - Server error

## Infrastructure

The Alchemy infrastructure definition in `alchemy.run.ts` creates:

- **Worker** - Cloudflare Worker with custom domain (`unletter.app`)
- **KV Namespace** - `unletter-waitlist` for storing email entries
- **Static Assets** - Served from `src/assets/`
- **Secrets** - Admin API key for authentication
- **State Store** - Cloudflare-based state management for deployments
- **GitHub Integration** - Automatic PR preview comments

## License

MIT
