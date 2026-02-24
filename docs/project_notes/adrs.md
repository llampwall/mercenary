# ADRs

### ADR-001: Canonical project memory in `docs/project_notes/` (2026-02-24)

**Context:**
- The repository already contains legacy notes under `docs/memory/`.
- Multiple note locations increase drift risk across agents and sessions.

**Constraint:**
- Institutional project memory MUST be maintained in `docs/project_notes/`.
- `docs/memory/` MUST be treated as legacy and non-canonical unless explicitly migrated.

**Decision:**
- Adopt the five-file project memory system in `docs/project_notes/`:
  - `operating_brief.md`
  - `key_facts.md`
  - `adrs.md`
  - `bugs.md`
  - `worklog.md`

**Alternatives:**
- Continue using only `docs/memory/` -> rejected because it does not follow the current project-context protocol.
- Keep both systems active indefinitely -> rejected because duplication creates conflicting truths.

**Consequences:**
- Benefits:
  - One source of truth for onboarding and planning context.
  - Cleaner separation of constraints, facts, bugs, and checkpoints.
- Trade-offs:
  - Existing legacy notes require explicit migration or retirement.

**Status:** Active

### ADR-002: Enforce Windows-safe script execution and line-ending rules (2026-02-24)

**Context:**
- The repo targets cross-platform collaboration and explicitly includes Windows guardrails in `AGENTS.md`.
- Inconsistent script invocation and line endings can cause avoidable local failures.

**Constraint:**
- Automation MUST live in `scripts/` or `tools/`.
- On Windows, if a `.ps1` sibling exists, contributors MUST run `pwsh -File scripts\\task.ps1` (or the matching `.ps1` path) instead of invoking `.cmd`/`.bat`.
- Text files MUST use LF line endings; only `.bat` and `.cmd` MAY use CRLF.
- Multiline newline-sensitive edits MUST use direct file edits, not ad-hoc Python/regex replacement scripts.

**Decision:**
- Treat existing guardrails in `AGENTS.md`, `.editorconfig`, and `.gitattributes` as project-level constraints.

**Alternatives:**
- Leave rules as informal guidance only -> rejected because consistency depends on durable enforcement.
- Rely on CI checks alone -> rejected because current CI is placeholder-only and cannot enforce these rules.

**Consequences:**
- Benefits:
  - Fewer Windows invocation errors (`spawn EINVAL` class issues).
  - Reduced newline churn and cross-platform formatting drift.
- Trade-offs:
  - Contributors must follow stricter execution/editing discipline.

**Status:** Active
