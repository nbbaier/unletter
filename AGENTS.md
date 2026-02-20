# AGENTS.md

Guidance for working in this repository.

## Project Snapshot

Unletter is a Cloudflare Workers app (managed with Alchemy) that will convert newsletters to RSS. Current focus is landing page + waitlist.

## Core Commands

```bash
bun install
bun run dev
bun run build
bun run deploy
bun run lint
bun run lint:fix
bun run destroy
```

## Architecture

- Infrastructure is defined in `alchemy.run.ts`.
- Worker logic lives in `src/worker.ts`.
- Static assets are served from `src/assets/`.
- Worker bindings/types are declared in `types/env.d.ts`.

### Worker Routes

- `POST /api/waitlist`
- Validates email format.
- Stores signup in `WAITLIST` KV with metadata.
- Returns `409` if email already exists.

- `GET /admin/waitlist`
- Requires Bearer auth via `ADMIN_API_KEY`.
- Returns newest-first entries as `{ total, emails }`.

- All other routes serve static assets from `ASSETS`.

## Required Patterns

- Keep worker bindings type-safe through `worker.Env` from `alchemy.run.ts`.
- Ensure `alchemy.run.ts` ends with `app.finalize()`.
- Keep waitlist KV keys mapped directly by email.
- Include CORS header `access-control-allow-origin: *` on API responses.

## Environment

- `ALCHEMY_PASSWORD`: required for local secret encryption.
- `ADMIN_API_KEY`: required for `/admin/waitlist` auth.

## Quality Standards

- Use TypeScript strict mode and Biome formatting (tabs + double quotes).
- Prefer clear names, small focused functions, and early returns.
- Use `async/await` and handle errors with meaningful `Error` messages.
- Avoid `any` when possible (`unknown` + narrowing preferred).
- Remove debugging leftovers (`console.log`, `debugger`, `alert`) from production code.
- Validate and sanitize user input.

## Validation Workflow

Before finishing work:

1. Run `bun x ultracite fix`.
2. Run `bun x ultracite check`.
3. Run relevant tests/build (`bun run build`, targeted test commands).
