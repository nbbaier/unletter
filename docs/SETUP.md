# Setup & Deployment Guide

This guide covers how to deploy unletter and configure it for production use.

## Prerequisites

- [Bun](https://bun.sh) installed
- Cloudflare account
- [inbound.new](https://inbound.new) account for email reception

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Required for Alchemy state encryption
ALCHEMY_PASSWORD=your-secure-password-here

# Admin API key for waitlist management
ADMIN_API_KEY=your-admin-api-key

# Secret for verifying inbound.new webhooks
WEBHOOK_SECRET=your-webhook-secret

# Secret for signing JWT tokens (use a long random string)
JWT_SECRET=your-jwt-secret-at-least-32-characters
```

### Generating Secrets

You can generate secure random secrets using:

```bash
# Using openssl
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Deployment Steps

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Environment Variables

Either create a `.env` file (for local development) or set the variables in your CI/CD environment.

### 3. Deploy to Cloudflare

```bash
bun run deploy
```

This will:
- Create the Cloudflare Worker
- Create the KV namespaces (WAITLIST, DATA)
- Configure the domain (unletter.app)
- Set up secrets

### 4. Configure inbound.new

1. Log in to your [inbound.new](https://inbound.new) dashboard
2. Set up a domain or use their provided domain
3. Create a webhook endpoint pointing to:
   ```
   https://unletter.app/api/webhook/inbound
   ```
4. Copy the webhook verification token and set it as `WEBHOOK_SECRET` in your environment
5. Configure a catch-all email route to send all emails to your webhook

### 5. Verify Deployment

Test the deployment:

```bash
# Check the landing page
curl https://unletter.app

# Test signup
curl -X POST https://unletter.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# Test login
curl -X POST https://unletter.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

## Local Development

### Running Locally

```bash
bun run dev
```

This starts a local development server using Miniflare.

### Testing the Webhook Locally

For local webhook testing, you can use a tool like [ngrok](https://ngrok.com) to expose your local server:

```bash
# In one terminal
bun run dev

# In another terminal
ngrok http 8787
```

Then configure inbound.new to send webhooks to your ngrok URL.

## Architecture

### KV Key Schema

```
# Users
user:{user-id}              -> User object (id, email, passwordHash, createdAt)
user:email:{email}          -> user-id (lookup index)
user:{user-id}:feeds        -> string[] (feed IDs)

# Feeds
feed:{feed-id}              -> Feed object (id, userId, name, emailAddress, createdAt)
feed:{feed-id}:emails       -> string[] (email IDs, newest first)

# Emails
email:{email-id}            -> StoredEmail object
```

### Security Notes

- Passwords are hashed using PBKDF2 with 100,000 iterations
- JWTs expire after 7 days
- Webhook requests are verified using the `X-Webhook-Verification-Token` header
- Feed IDs are random 10-character strings (nanoid)
- Users can only access/delete their own feeds

## Troubleshooting

### Webhook not receiving emails

1. Verify your `WEBHOOK_SECRET` matches the token from inbound.new
2. Check the Cloudflare Workers logs for errors
3. Ensure the domain/email routing is correctly configured in inbound.new

### JWT errors

1. Ensure `JWT_SECRET` is set and is the same across deployments
2. Tokens expire after 7 days - users need to log in again

### Feed not found errors

1. Verify the feed ID exists (check via `/api/feeds` with auth)
2. Ensure the email was sent to the correct address (`{feed-id}@unletter.app`)

## Monitoring

View logs in the Cloudflare dashboard:

1. Go to Workers & Pages
2. Select the unletter worker
3. Click on "Logs" to see real-time logs

## Updating

To deploy updates:

```bash
git pull
bun install
bun run deploy
```
