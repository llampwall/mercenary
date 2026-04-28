# Claude Instructions

Repo: mercenary

- Be direct. Prefer simple solutions.
- Default to tests + lint + CI green.

## Project

Node.js CLI + module that wraps `claude` and `codex` with Windows-safe subprocess orchestration. Single file, zero dependencies.

## Language

JavaScript (Node.js 22, ESM)

## Structure

- `mercenary.js` -- Single file: module exports + CLI entry point
- `test/mercenary.test.js` -- Unit, CLI, ledger, and integration-gated tests
- `docs/specs/mercenary.md` -- Specification
- `docs/project_notes/` -- Canonical project memory

## Key Rules

- Zero external dependencies. Keep core behavior in `mercenary.js`.
- Windows-first implementation is intentional (`taskkill`, `wt`, `pwsh`).
- Claude one-shot launches MUST include `--dangerously-skip-permissions`; one-shot adds `--no-session-persistence` unless `--resume` is used.
- Pipeline role MUST enforce strict MCP isolation via `--strict-mcp-config` and MUST NOT inject a hardcoded `mcp-none.json` fallback.
- Interactive sessions default `strictMcp` to `false`; strict MCP in interactive mode is explicit opt-in.
- `codex` one-shot defaults to `--dangerously-bypass-approvals-and-sandbox --ephemeral` unless `sandbox` is explicitly provided.
- Child env sanitization MUST remove `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and `ANTHROPIC_API_KEY`.
- Child `SHELL` MUST be forced to pwsh path for Windows automation consistency.
- Every spawned process MUST be tracked in `.process-ledger.json` (`--ps`, `--audit`, `--purge` workflows depend on this).
- `--am` reads persona from `P:\software\allmind\config\persona\allmind-voice.md`.
- When opening this repo, check if session brief shows `ACTION REQUIRED` -- if so, offer to run `/update-memory`.

## Commands

```powershell
node mercenary.js --prompt "test" --timeout 10
node mercenary.js --prompt "test" --backend codex --timeout 10
node mercenary.js --interactive
node mercenary.js --ps
node mercenary.js --audit
node mercenary.js --purge
node test/mercenary.test.js
```

## Memory System

Chinvex repos use structured memory files in `docs/memory/`:

- **STATE.md**: Current objective, active work, blockers, next actions
- **CONSTRAINTS.md**: Infrastructure facts, rules, hazards (merge-only)
- **DECISIONS.md**: Append-only decision log with dated entries

**SessionStart Integration**: When you open a chinvex-managed repo, a hook runs `chinvex brief --context <name>` to load project context.

**If memory files are uninitialized** (empty or bootstrap templates), the brief will show "ACTION REQUIRED" instructing you to run `/update-memory`.

**The /update-memory skill** analyzes git history and populates memory files with:
- Current state from recent commits
- Constraints learned from bugs/infrastructure
- Decisions with evidence (commit hashes)

## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.
Project notes are updated automatically by a post-commit maintainer (triggered by meaningful commits).

### Memory Files (non-overlapping)

- **operating_brief.md** - Entry point: what this project is, goals, current state, hazards, and next steps. Read this first when starting a fresh chat.
- **key_facts.md** - Lookupable truths: commands, ports, URLs, paths, env var *names*, deployment targets. Prefer documented facts over assumptions.
- **adrs.md** - **Constraints (ADRs)**: long-lived rules/invariants + rationale future changes must respect. If it does not create a constraint, it does not belong.
- **bugs.md** - Recurring/scary bugs: symptom -> root cause -> fix -> prevention.
- **worklog.md** - **Checkpoints**: outcomes + local intent for completed work. May link ADRs/bugs/key facts; must not duplicate them.

### Memory-Aware Protocol

**Before proposing changes:**
- Read `docs/project_notes/operating_brief.md` first.
- Check `docs/project_notes/adrs.md` before proposing architectural or data-model changes.
- Check `docs/project_notes/key_facts.md` before asserting commands/ports/paths/URLs/env-var names.

**When encountering errors or bugs:**
- Search `docs/project_notes/bugs.md` first.
- If the issue was expensive/non-obvious or likely to recur, update `bugs.md` (symptom -> root cause -> fix -> prevention).

**After completing meaningful work (ready to keep):**
- Verify the change (run relevant tests / quick sanity checks).
- If the user has approved the change (or you are confident it is correct and intended), commit the work using `$git-commit-helper`.
- Ownership:
  - The main coding agent should **not** edit `docs/project_notes/*` directly.
  - Only the post-commit maintainer edits those files (unless user explicitly requests manual edits).

**If work appears complete but is not yet approved:**
- Ask the user if they want to commit now.
- If approved, commit using `$git-commit-helper`.
- If not approved, leave changes uncommitted and do not update `docs/project_notes/*`.

**Notes update policy:**
- `docs/project_notes/*` is maintained automatically after meaningful commits.
- If no meaningful notes updates are needed, the maintainer will leave them unchanged.

### Checkpoint Mode (Default)

- Run the maintainer only after `git commit` (or a manual checkpoint command).
- Prefer commit-backed inputs (`git show -1` plus commit message context) when deciding note edits.
- Ignore uncommitted churn.
- Prefer editing existing entries over appending noise.
- If nothing meaningful changed, make no notes edits.

### Anti-Redundancy Rules

- `worklog.md` must not duplicate ADR rationale, bug writeups, or key facts.
- If details belong elsewhere, link to `adrs.md`, `bugs.md`, or `key_facts.md`.
- `operating_brief.md` is curated (rewrite allowed). Keep it short.
- If no meaningful doc changes are needed, say `No project_notes updates needed for this change.`

### Meaningful commits (what triggers the maintainer)

Treat a commit as meaningful if it changes behavior, data shape, interfaces, build/deploy wiring, or fixes a non-trivial bug.
Do NOT treat these as meaningful:
- docs-only changes (including `docs/project_notes/*`, `AGENTS.md`, `CLAUDE.md`)
- formatting/lint-only churn
- merges
- commit messages prefixed with `docs:` or `notes:`


Before searching for files with Glob/Grep, check docs/sys/lookup.json — a concept-to-files index. If your search term matches a key, you already know which files to read.
