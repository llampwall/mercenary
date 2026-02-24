# Operating Brief

## One-liner
- `mercenary` is a Node.js 22+ CLI and module that standardizes Claude Code subprocess lifecycle on Windows for one-shot and interactive sessions.

## Goals
- Provide one spawn primitive for direct CLI usage and downstream AllMind integrations.
- Enforce consistent launch defaults: required Claude flags, child env sanitization, and process-tree cleanup.
- Keep the implementation dependency-free and easy to vendor (`mercenary.js` single file).

## Non-goals
- Hosting an HTTP API server in this repository.
- Supporting Linux/macOS process orchestration in the current implementation.

## Current state
- Working: one-shot mode (`run()` / `--prompt`) captures stdout/stderr and returns timeout/duration metadata.
- Working: interactive mode (`openSession()` / `--interactive`) launches Windows Terminal via generated PowerShell launcher script.
- Working: role-based presets (`pipeline`, `allmind`, `coordinator`) and persona injection are implemented.
- Fragile: CI is placeholder-only and does not execute tests.
- Fragile: integration tests require local Claude availability and are skipped unless explicitly enabled.

## Repo map
- `mercenary.js`: single implementation file (module exports + CLI entrypoint).
- `test/mercenary.test.js`: unit, CLI, and gated integration tests.
- `package.json`: Node engine requirement and CLI bin mapping.
- `docs/specs/mercenary.md`: behavior/specification reference.
- `AGENTS.md` and `CLAUDE.md`: maintainer guardrails and mirrored assistant rules.
- `docs/project_notes/`: canonical project memory.

## System map
- Components:
  - Process wrapper: `run`, `openSession`, `treeKill`, `resolveClaudePath`
  - CLI execution path: arg parsing plus mode routing (`--prompt`, `--interactive`, `--kill`)
  - Test layer: `node:test` suite covering exports, parser behavior, kill behavior, and integration gates
- Data flow:
  1) Caller invokes CLI or imports module API.
  2) Mercenary resolves `claude` path, sanitizes env, builds args, and spawns child process.
  3) One-shot mode buffers output and enforces timeout with process-tree kill.
  4) Interactive mode writes launcher artifacts to temp and opens `wt` + `pwsh`.

## Active constraints
- ADR-001: Canonical project memory is `docs/project_notes/`.
- ADR-002: Windows-safe automation invocation and newline policy are mandatory.
- ADR-003: Mercenary remains a Windows-first single-file wrapper with mandatory env sanitization and required Claude launch flags.

## Known hazards
- `--interactive` depends on `wt` and `pwsh` being installed and discoverable.
- The built-in known Claude path is user-specific; set `CLAUDE_PATH` on other hosts.
- Placeholder CI can report green while runtime regressions exist.

## Next steps
1) Replace placeholder CI with real test execution, including Windows coverage.
2) Define release/versioning workflow for distributing the `mercenary` CLI.
3) Add targeted automated checks for role-based launch presets.

## How to get oriented fast
- Start here: `README.md`, then `docs/specs/mercenary.md`.
- Runbook: `docs/project_notes/key_facts.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
- Bug playbook: `docs/project_notes/bugs.md`
