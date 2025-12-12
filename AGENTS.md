# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Unletter is a newsletter-to-RSS conversion service built on Cloudflare Workers using Alchemy for infrastructure-as-code. Currently in landing page phase with waitlist functionality. The service will eventually convert email newsletters into persistent RSS feeds.

## Development Commands

```bash
# Install dependencies
bun install

# Local development server
bun run dev

# Deploy to Cloudflare
bun run deploy

# Type checking
bun run build

# Linting
bun run lint          # Check for issues
bun run lint:fix      # Auto-fix issues

# Destroy all infrastructure
bun run destroy
```

## Architecture

### Infrastructure (`alchemy.run.ts`)

The project uses Alchemy to define Cloudflare infrastructure as TypeScript code. The main worker is configured with:

-  **Static Assets**: HTML/CSS/images served from `src/assets/`
-  **KV Namespace**: `WAITLIST` binding for storing email signups
-  **Secrets**: `ADMIN_API_KEY` for admin endpoint authentication
-  **Domain**: Configured for `unletter.app`
-  **State Store**: Uses CloudflareStateStore for production deployments

### Worker (`src/worker.ts`)

The Cloudflare Worker handles three routes:

1. **POST /api/waitlist**: Email signup endpoint

   -  Validates email format
   -  Stores entries in KV with metadata (timestamp, user agent, referrer)
   -  Returns 409 if email already exists

2. **GET /admin/waitlist**: Admin endpoint

   -  Requires Bearer token authentication via `ADMIN_API_KEY`
   -  Returns all waitlist entries sorted by timestamp (newest first)
   -  Format: `{ total: number, emails: WaitlistEntry[] }`

3. **All other routes**: Serves static assets from `ASSETS` binding

### Type Safety

The project uses `types/env.d.ts` to provide full type safety for Cloudflare Worker bindings. All environment variables and bindings are typed through `typeof worker.Env` exported from `alchemy.run.ts`.

### Code Style

-  **Formatter**: Biome with tab indentation and double quotes
-  **TypeScript**: Strict mode enabled, ESNext target
-  **Imports**: Auto-organized by Biome

## Key Files

-  `alchemy.run.ts` - Infrastructure definition (must end with `app.finalize()`)
-  `src/worker.ts` - Worker request handler with API routes
-  `src/assets/` - Static HTML, CSS, images
-  `types/env.d.ts` - Type definitions for Worker environment bindings
-  `biome.json` - Linter and formatter configuration

## Environment Variables

Set in `.env` for local development:

-  `ALCHEMY_PASSWORD` - Required for encrypting secrets
-  `ADMIN_API_KEY` - Bearer token for admin endpoint

## Important Patterns

1. **Worker bindings are type-safe**: Import `worker.Env` type from `alchemy.run.ts`
2. **Always call `app.finalize()`**: Required at end of `alchemy.run.ts` to clean up resources
3. **KV keys are emails**: Direct email-to-entry mapping in WAITLIST namespace
4. **CORS enabled**: All API responses include `access-control-allow-origin: *`

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

-  Dependency-aware: Track blockers and relationships between issues
-  Git-friendly: Auto-syncs to JSONL for version control
-  Agent-optimized: JSON output, ready work detection, discovered-from links
-  Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

-  `bug` - Something broken
-  `feature` - New functionality
-  `task` - Work item (tests, docs, refactoring)
-  `epic` - Large feature with subtasks
-  `chore` - Maintenance (dependencies, tooling)

### Priorities

-  `0` - Critical (security, data loss, broken builds)
-  `1` - High (major features, important bugs)
-  `2` - Medium (default, nice-to-have)
-  `3` - Low (polish, optimization)
-  `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   -  `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:

-  Exports to `.beads/issues.jsonl` after changes (5s debounce)
-  Imports from JSONL when newer (e.g., after `git pull`)
-  No manual export/import needed!

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.
Run `bd onboard` to get the content, or see step 2 of the onboard instructions.

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):

```json
{
   "beads": {
      "command": "beads-mcp",
      "args": []
   }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:

-  PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
-  DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
-  TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**

-  Create a `history/` directory in the project root
-  Store ALL AI-generated planning/design docs in `history/`
-  Keep the repository root clean and focused on permanent project files
-  Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**

```
# AI planning documents (ephemeral)
history/
```

**Benefits:**

-  ✅ Clean repository root
-  ✅ Clear separation between ephemeral and permanent documentation
-  ✅ Easy to exclude from version control if desired
-  ✅ Preserves planning history for archeological research
-  ✅ Reduces noise when browsing the project

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.

### Important Rules

-  ✅ Use bd for ALL task tracking
-  ✅ Always use `--json` flag for programmatic use
-  ✅ Link discovered work with `discovered-from` dependencies
-  ✅ Check `bd ready` before asking "what should I work on?"
-  ✅ Store AI planning docs in `history/` directory
-  ✅ Run `bd <cmd> --help` to discover available flags
-  ❌ Do NOT create markdown TODO lists
-  ❌ Do NOT use external issue trackers
-  ❌ Do NOT duplicate tracking systems
-  ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.
