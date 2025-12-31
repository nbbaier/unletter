# User Dashboard

**Category:** New Feature
**Quarter:** Q1-Q2
**T-shirt Size:** L

## Why This Matters

Unletter's core functionality is complete—users can sign up, create feeds, receive newsletters, and access RSS feeds. But there's no **interface** for users to manage any of this. Currently, everything must be done via API calls. This is a dealbreaker for non-technical users and a poor experience even for technical ones.

A polished dashboard transforms Unletter from a developer tool into a consumer product. It's the difference between "technically works" and "people will actually use this." The dashboard is where users discover the value of the service, manage their subscriptions, and build the habit of using Unletter.

## Current State

- Landing page exists with waitlist signup (`src/assets/index.html`)
- All user actions require direct API calls
- No session management beyond JWT tokens
- No feed management UI
- No way for users to see their newsletters or configure feeds
- Email-based feed addresses are generated but not displayed anywhere
- Web view exists for individual emails, but no navigation between them

## Proposed Future State

Users log in to a beautiful, responsive dashboard that feels as good as Notion or Linear. They can:

- **See all their feeds** at a glance with unread counts and latest items
- **Create new feeds** with one click, getting a unique email address to subscribe to newsletters
- **Browse newsletters** in a clean reader view with newsletter branding preserved
- **Search across all newsletters** by keyword, sender, or date
- **Mark items read/unread** and organize favorites
- **Configure feed settings** (name, retention, notifications)
- **Export feeds** to OPML for backup
- **Copy RSS/Atom URLs** easily for their reader of choice
- **See account settings** including usage stats and connected apps

The design language extends the editorial aesthetic of the landing page—warm, readable, and focused on content.

## Key Deliverables

- [ ] Choose frontend framework (React with Vite, or SvelteKit, or Astro)
- [ ] Design dashboard information architecture and wireframes
- [ ] Implement authentication flow (login, signup, logout, password reset)
- [ ] Build feed list view with unread counts
- [ ] Build feed creation flow with email address display
- [ ] Build individual feed view with newsletter list
- [ ] Build newsletter reader view (styled web view)
- [ ] Implement search functionality across newsletters
- [ ] Build settings page (account, security, preferences)
- [ ] Add OPML export functionality
- [ ] Implement responsive design for mobile web
- [ ] Add loading states, error handling, empty states
- [ ] Deploy frontend (Cloudflare Pages or Workers Static Assets)
- [ ] Add onboarding flow for new users

## Prerequisites

- **Security Hardening (Initiative 02)**: Auth endpoints need rate limiting before exposing to a frontend
- **Test Suite (Initiative 01)**: API stability required before building UI on top

## Risks & Open Questions

- Frontend framework choice affects team velocity and bundle size
- Should the dashboard be a separate app or integrated with the Worker?
- How do we handle session refresh and token expiration gracefully?
- What's the right information density for the dashboard?
- Do we need dark mode from the start?
- Mobile-first or desktop-first design?
- How much newsletter content should be visible in list view vs. detail view?

## Notes

The existing landing page (`src/assets/index.html`) uses Crimson Pro and Work Sans fonts with an orange accent. The dashboard should extend this aesthetic.

Current API endpoints that will power the dashboard:
- `POST /api/auth/signup`, `POST /api/auth/login` - Authentication
- `GET /api/feeds`, `POST /api/feeds`, `DELETE /api/feeds/:id` - Feed management
- Feed content is accessible via `/feeds/:id` but needs pagination

New API endpoints likely needed:
- `GET /api/feeds/:id/emails` - List emails in a feed (paginated)
- `PATCH /api/feeds/:id` - Update feed settings
- `GET /api/user` - Get current user profile
- `PATCH /api/user` - Update user settings
- `POST /api/auth/reset-password` - Password reset flow
