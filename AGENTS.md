# Agents

Repo: mercenary

## Guardrails
- Keep changes small and reviewable.
- Put automation in `scripts/` or `tools/`.
- On Windows, if a `.ps1` sibling exists, prefer `pwsh -File <script>` over spawning `.cmd`/`.bat`; otherwise use `shell: true` (or `cmd.exe /c`) to avoid `spawn EINVAL`.
- Keep root guidance synchronized: when memory protocol changes here, mirror it in `CLAUDE.md`.

## No Python Replace for Newlines
Do not use ad‑hoc Python/regex replacements to edit files. For multiline/escape edits: show the 10–30 line snippet, edit directly, then re‑show the snippet (or `rg`) to verify.
LF is standard; CRLF only for .bat/.cmd.

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
