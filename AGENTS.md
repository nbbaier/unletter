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

## Design Context

### Users
Newsletter-fatigued professionals and RSS power users. People who already value intentional reading workflows and want their newsletters out of email and into a feed reader. They are comfortable with RSS but frustrated by inbox clutter. They expect tools that respect their time and attention.

### Brand Personality
**Quiet, editorial, trusted.** Unletter should feel like a well-made reading tool — understated confidence, not shouting for attention. The interface should recede behind the content, like a good book design.

### Aesthetic Direction
- **Visual tone**: Warm minimalism. Editorial typography. Content over chrome.
- **References**: Bear, iA Writer — warm, minimal writing tools that prioritize text and use restraint as a feature.
- **Anti-references**: Flashy SaaS dashboards, gradient-heavy marketing sites, AI-generated card grids with icons. Nothing that feels like a template.
- **Theme**: Light mode primary with warm off-white (`--paper: #fdfbf7`). Dark mode planned.
- **Typography**: Crimson Pro (serif, display/headings) + Work Sans (sans, body). No additional fonts.
- **Palette**: Narrow and intentional — `--ink`, `--paper`, `--accent` (#d84315 deep orange), `--muted`, `--border`. Expand tokens only when needed.
- **Shape**: Flat, no border-radius on primary elements. Square edges are part of the editorial identity.
- **Texture**: Subtle film grain overlay at low opacity. Keep it.

### Accessibility
- **Target**: WCAG AAA compliance.
- **Themes**: Light + dark mode (dark mode not yet implemented).
- **Requirements**: Visible focus indicators on all interactive elements. `prefers-reduced-motion` support mandatory — never gate content visibility behind animation. Contrast ratios must meet 7:1 for normal text, 4.5:1 for large text.
- **Color blindness**: Avoid conveying meaning through color alone. Use text labels alongside color states (success, error, info).

### Design Principles
1. **Content first** — The interface should disappear. Typography, whitespace, and hierarchy do the work. No decorative elements that don't serve comprehension.
2. **Quiet confidence** — No flashy interactions, no gratuitous animation. Motion is functional (state changes, focus). The product earns trust through restraint.
3. **Editorial craft** — Treat every text element like it's being typeset. Proper hierarchy, intentional spacing, considered line lengths. Sweat the details that readers feel but don't notice.
4. **Expand tokens, not exceptions** — When a new color or value is needed, add it to the design token system. Never hard-code a one-off hex value in a component.
5. **Accessible by default** — AAA is the floor, not the ceiling. Every interactive element must be keyboard-navigable with visible focus. Every state change must be announced. Every animation must respect user preferences.
