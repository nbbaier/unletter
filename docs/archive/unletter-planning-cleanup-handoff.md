# Handoff: Unletter Planning Cleanup

## Purpose

Prepare the next agent to clean up Unletter's planning/tracking state, likely by turning the current file-system planning artifacts into a GitHub-tracked blueprint/spec plus leaf issues.

The user explicitly said this should be "in the form of a blueprint" but also said **do not run the blueprint workflow yet**. Treat this handoff as setup/context for a future blueprint run, not as authorization to create issues, specs, or plans.

## Repository

- Local path: `/Users/nbbaier/Code/unletter`
- GitHub repo: `nbbaier/unletter`
- Current branch during inspection: `main`
- Current HEAD during inspection: `305dd03`
- Working tree note during inspection: only untracked `.codex/` was present.

## What Was Inspected

Local planning and process artifacts:

- `/Users/nbbaier/Code/unletter/AGENTS.md`
- `/Users/nbbaier/Code/unletter/docs/agents/issue-tracker.md`
- `/Users/nbbaier/Code/unletter/docs/agents/triage-labels.md`
- `/Users/nbbaier/Code/unletter/docs/agents/domain.md`
- `/Users/nbbaier/Code/unletter/docs/roadmap/README.md`
- `/Users/nbbaier/Code/unletter/docs/roadmap/*.md`
- `/Users/nbbaier/Code/unletter/docs/plans/README.md`
- `/Users/nbbaier/Code/unletter/docs/plans/*.md`
- `/Users/nbbaier/Code/unletter/docs/IMPLEMENTATION_SUMMARY.md`
- `/Users/nbbaier/Code/unletter/docs/ARCHITECTURE.md`
- `/Users/nbbaier/Code/unletter/beads-issues-20260110-175754.jsonl`

Hosted GitHub state:

- `gh issue list --repo nbbaier/unletter --state all --limit 100 --json number,title,state,labels,createdAt,updatedAt,closedAt,url`
- `gh label list --repo nbbaier/unletter --limit 100 --json name,description,color`
- `gh pr list --repo nbbaier/unletter --state all --limit 50 --json number,title,state,createdAt,updatedAt,closedAt,mergedAt,url`

The `gh` commands required network escalation in the sandbox. They were read-only.

## Current Planning Situation

Planning is mostly local Markdown, not GitHub Issues.

The repo docs say issues and PRDs should live in GitHub Issues:

- `/Users/nbbaier/Code/unletter/docs/agents/issue-tracker.md`

But GitHub Issues currently returned an empty list for all states:

- open issues: 0
- closed issues: 0

The hosted label set is still GitHub's default labels:

- `bug`
- `documentation`
- `duplicate`
- `enhancement`
- `good first issue`
- `help wanted`
- `invalid`
- `question`
- `wontfix`

The canonical triage labels documented in `/Users/nbbaier/Code/unletter/docs/agents/triage-labels.md` do not appear to exist on GitHub:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix` exists, but only as a default label

GitHub PRs are active implementation history, not the planning surface:

- 31 PRs total
- 0 open PRs
- 17 merged PRs
- 14 closed unmerged PRs

Recent PRs are mostly perf/refactor work. PRs should not be treated as the issue queue; `/Users/nbbaier/Code/unletter/docs/agents/issue-tracker.md` explicitly says external PRs are not a triage surface.

## Local Planning Artifacts

### Active-looking execution plans

`/Users/nbbaier/Code/unletter/docs/plans/README.md` lists five implementation plans generated on 2026-06-11 against commit `917b4bc`. All are marked `TODO`.

Plans:

1. `001` - Make `WEBHOOK_SECRET` a hard validation error
2. `002` - Serve feed list from denormalized data / kill N+1
3. `003` - Test web-view render + link extraction
4. `004` - Fix RateLimiterDO alarm cleanup window logic
5. `005` - Remove dead KV RateLimiter + orphaned perf test

Important: these may be stale relative to current `main` at `305dd03`. At minimum, plan `002` should be reconciled carefully because merged PR history includes feed-list denormalization/perf work after the plan base commit.

### Strategic roadmap

`/Users/nbbaier/Code/unletter/docs/roadmap/README.md` contains a 2026 roadmap with 10 initiatives plus a moonshot:

- 01 Comprehensive Test Suite
- 02 Security Hardening
- 03 User Dashboard
- 04 D1 Database Migration
- 05 Multi-Format Export
- 06 Newsletter Discovery
- 07 AI-Powered Features
- 08 Native Mobile Apps
- 09 Premium Tier & Monetization
- 10 Developer API & Ecosystem
- 00 Moonshot: Newsletter OS

This is strategy-level and broad. Many checkboxes are unchecked. It should not be dumped wholesale into GitHub Issues without triage, pruning, and dependency review.

### Older improvement summary

`/Users/nbbaier/Code/unletter/docs/IMPLEMENTATION_SUMMARY.md` is from January 31, 2026. It summarizes 30 improvement ideas and notes two implemented items: comprehensive tests and HTML sanitization.

Treat it as historical context, not current source of truth.

### Historical issue export

`/Users/nbbaier/Code/unletter/beads-issues-20260110-175754.jsonl` contains 12 Beads-era issue records for Phase 1 core conversion MVP. All have `"status":"closed"`.

Treat as archive/migration evidence only.

### Domain docs gap

`/Users/nbbaier/Code/unletter/docs/agents/domain.md` says agents should read:

- `/Users/nbbaier/Code/unletter/CONTEXT.md`
- `/Users/nbbaier/Code/unletter/docs/adr/`

Neither existed during inspection. The domain docs file says to proceed silently when absent, so this is not necessarily an error, but it matters if a future blueprint needs domain vocabulary or ADR decisions.

## Main Inconsistencies To Resolve

1. The documented tracker says GitHub Issues are the source of truth, but GitHub Issues are empty.
2. The documented triage label vocabulary is not installed on GitHub.
3. The file-system plans are marked TODO but were generated against an older commit.
4. Some roadmap/architecture content is aspirational or stale relative to current code and PR history.
5. There are multiple planning layers with unclear authority:
   - AGENTS.md
   - docs/roadmap
   - docs/plans
   - docs/IMPLEMENTATION_SUMMARY.md
   - docs/ARCHITECTURE.md
   - Beads JSONL archive
   - GitHub PR history
   - empty GitHub Issues

## Recommended Next-Agent Objective

Create a planning cleanup blueprint that makes GitHub Issues the live planning/tracking surface, while demoting local artifacts to strategy/archive/reference roles.

Suggested outcome:

- One parent GitHub issue or PRD-style issue for "Repo planning cleanup / issue tracker setup".
- A small set of child/leaf GitHub issues, probably `ready-for-agent` once labels exist.
- Updated local docs that explain what lives where.
- Reconciled or retired local `docs/plans` TODO rows.

Do not immediately convert every roadmap checkbox into an issue. Start with the tracking-system cleanup itself, then decide what backlog items deserve promotion.

## Suggested Blueprint Shape

Use the `blueprint` skill in a later session, but do not treat this handoff as having already run Phase 0 or Phase 1.

Likely spec problem statement:

> Unletter's repo says GitHub Issues are the planning source of truth, but current planning is scattered across local Markdown files while GitHub Issues are empty and missing documented triage labels. Agents need a clear, current, low-duplication planning system that separates strategy, executable work, archives, and implementation history.

Likely decisions to capture:

- GitHub Issues are the live tracker for PRDs and executable work.
- `docs/roadmap/` remains strategic context, not a literal issue backlog.
- `docs/plans/` should either be migrated into issues or clearly marked as local generated plans/archive.
- `beads-issues-20260110-175754.jsonl` should be marked archival or moved under an archive path if desired.
- PRs remain implementation history, not triage input.
- The documented label vocabulary should be installed or the docs should be changed to match actual labels.

Likely leaf slices:

1. Install/reconcile GitHub triage labels.
2. Create an issue-tracker source-of-truth issue/PRD that records the planning cleanup decisions.
3. Reconcile `docs/plans` against current `main`, then migrate valid TODO plans into GitHub Issues or mark them stale/rejected locally.
4. Update planning docs so agents know exactly what lives in GitHub versus local files.
5. Optionally archive or annotate historical artifacts (`beads` export, old implementation summary).

Keep these as proposed slices only until the user approves a blueprint breakdown.

## Suggested Skills

- `blueprint`: Use when the user is ready to turn this handoff into a spec and tracked issues. Follow the skill normally then, including destination resolution and user checkpoints. Do not skip approval steps.
- `github:github`: Use for current GitHub issue/label/PR state and for issue creation/update if the user authorizes it.
- `triage`: Useful after labels/issues exist, not before.
- `code-review` or `code-refactor-review`: Only if the next agent also audits actual code changes. Not needed for pure planning cleanup.
- `domain-modeling` or `grill-with-docs`: Optional if the user wants to create the missing `CONTEXT.md`/ADR layer before issue migration.

## Commands And Queries Worth Repeating

Read-only local:

```bash
git status --short
git rev-parse --short HEAD
rg --files
sed -n '1,220p' docs/plans/README.md
sed -n '1,180p' docs/roadmap/README.md
wc -l beads-issues-20260110-175754.jsonl
```

Read-only GitHub:

```bash
gh issue list --repo nbbaier/unletter --state all --limit 100 --json number,title,state,labels,createdAt,updatedAt,closedAt,url
gh label list --repo nbbaier/unletter --limit 100 --json name,description,color
gh pr list --repo nbbaier/unletter --state all --limit 50 --json number,title,state,createdAt,updatedAt,closedAt,mergedAt,url
```

Network access may require escalation in Codex.

## Safety Notes

- Do not publish GitHub Issues or labels unless the user explicitly asks for the cleanup to be applied.
- Do not run the `blueprint` workflow merely because this handoff references it.
- Do not duplicate long contents of roadmap/plans into new docs; reference file paths and synthesize only the decisions.
- Redact secrets if any environment or deployment docs are opened later.
- Be careful with stale local plans: each plan has drift checks and was written against commit `917b4bc`; current main was `305dd03` during inspection.

