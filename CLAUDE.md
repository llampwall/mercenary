# Claude Instructions

Repo: mercenary

- Be direct. Prefer simple solutions.
- Default to tests + lint + CI green.

## Project

Node.js CLI + module that wraps Claude Code's `claude` command with proper subprocess management for Windows. Single file, zero dependencies.

## Language

JavaScript (Node.js 22, ESM)

## Structure

- `mercenary.js` -- Single file: module exports + CLI entry point
- `test/mercenary.test.js` -- Tests
- `docs/specs/mercenary.md` -- Specification

## Key Rules

- Zero external dependencies. Only Node.js stdlib.
- Single file (`mercenary.js`). No build step.
- Always set `--dangerously-skip-permissions` and `--no-session-persistence` on spawned claude processes
- Always delete `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY` from child env
- Use `shell: false` with resolved claude binary path (not shell lookup)
- Use `taskkill /T /F /PID` for process tree kill on Windows
- `--am` flag reads persona from `P:\software\allmind\data\persona\allmind-voice.md`

## Commands

```powershell
node mercenary.js --prompt "test" --timeout 10   # One-shot
node mercenary.js --interactive                    # Visible terminal
node test/mercenary.test.js                        # Run tests
```

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
- Ownership: the main coding agent should **not** edit `docs/project_notes/*` directly; only the post-commit maintainer edits those files (unless user explicitly requests manual edits).

**If work appears complete but is not yet approved:**
- Ask the user if they want to commit now.
- If approved, commit using `$git-commit-helper`.
- If not approved, leave changes uncommitted and do not update `docs/project_notes/*`.

**Notes update policy:**
- `docs/project_notes/*` is maintained automatically after meaningful commits.
- If no meaningful notes updates are needed, the maintainer will leave them unchanged.

### Anti-Redundancy Rules

- `worklog.md` must not duplicate ADR rationale, bug writeups, or key facts.
- If details belong elsewhere, link to `adrs.md`, `bugs.md`, or `key_facts.md`.
- `operating_brief.md` is curated (rewrite allowed). Keep it short.
- If no meaningful doc changes are needed, say `No project_notes updates needed for this change.`
