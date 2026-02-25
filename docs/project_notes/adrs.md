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

### ADR-003: Keep mercenary as a Windows-first single-file wrapper (2026-02-24)

**Context:**
- The repo was created to centralize Claude subprocess management behavior for downstream consumers.
- Divergent spawn behavior across tools causes recurring reliability issues.

**Constraint:**
- Core implementation MUST remain in `mercenary.js` as a dependency-free Node.js module/CLI.
- All Claude launches MUST include `--dangerously-skip-permissions`.
- One-shot launches MUST include `--no-session-persistence`; interactive launches MUST NOT include it.
- Child env MUST remove `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and `ANTHROPIC_API_KEY`.
- Timeout and external termination MUST use process-tree kill (`taskkill /T /F /PID`).

**Decision:**
- Keep the public surface centered on `run`, `openSession`, `treeKill`, and `resolveClaudePath` in one file.

**Alternatives:**
- Split logic into multiple packages/modules -> rejected due extra packaging overhead and drift risk for a small core wrapper.
- Make safety flags/env sanitization optional -> rejected because downstream consistency depends on mandatory defaults.

**Consequences:**
- Benefits:
  - One stable subprocess primitive for all consumers.
  - Simple vendoring/import path and fewer dependency vulnerabilities.
- Trade-offs:
  - Internal modularity is lower than a multi-file design.
  - Implementation remains explicitly Windows-specific.

**Status:** Active

### ADR-004: Default automation roles to strict MCP isolation (2026-02-24)

**Context:**
- Pipeline and coordinator runs were auto-loading user MCP servers, causing large bursts of visible subprocess windows.
- Automation roles need predictable headless behavior without inheriting user-local MCP fan-out.

**Constraint:**
- `role: "pipeline"` MUST include strict MCP mode by default.
- `role: "coordinator"` MUST default `strictMcp` to `true`.
- MCP servers used by automation MUST be explicitly selected via `mcpConfig`.
- Any strict-mode opt-out MUST be intentional at the call site.

**Decision:**
- Encode strict MCP defaults in role presets (`buildArgs()` and `openSession()`), with explicit override options (`strictMcp`, `mcpConfig`).

**Alternatives:**
- Disable MCP globally for all roles -> rejected because some workflows need curated MCP servers.
- Keep strict mode opt-in only -> rejected because default behavior repeatedly caused noisy subprocess storms.

**Consequences:**
- Benefits:
  - Prevents broad MCP subprocess fan-out in automation.
  - Makes MCP usage explicit and reproducible.
- Trade-offs:
  - Callers must provide `mcpConfig` when they need selective MCP access.

**Status:** Superseded by ADR-005

### ADR-005: Keep strict MCP default for pipeline, but make interactive strict mode opt-in (2026-02-24)

**Context:**
- Strict MCP mode removed user MCP fan-out for automation, but applying it by default to interactive sessions caused hangs in real usage.
- Interactive launches need reliability first; strict MCP in this path must be intentional and validated.

**Constraint:**
- `run()` with `role: "pipeline"` MUST default to strict MCP isolation.
- Pipeline strict mode MUST fall back to `P:\\software\\allmind\\config\\mcp-none.json` when no `mcpConfig` is provided.
- `openSession()` (including `role: "coordinator"`) MUST default `strictMcp` to `false`.
- Strict MCP in interactive mode MUST be explicitly opted in at the call site (`strictMcp: true`), with explicit `mcpConfig` preferred.

**Decision:**
- Keep strict MCP defaults in one-shot pipeline execution.
- Remove strict-MCP-by-default behavior from interactive sessions and treat it as an explicit override.
- Add launcher diagnostics and safer prompt argument handling to improve interactive troubleshooting.

**Alternatives:**
- Keep strict MCP as the default for interactive coordinator sessions -> rejected because it caused silent hangs.
- Remove strict MCP defaults everywhere -> rejected because pipeline automation still requires predictable MCP isolation.

**Consequences:**
- Benefits:
  - Interactive sessions launch more reliably.
  - Pipeline automation keeps deterministic MCP behavior.
- Trade-offs:
  - Interactive strict mode now requires explicit caller configuration.
  - Teams must document when interactive strict mode is actually required.

**Status:** Active
