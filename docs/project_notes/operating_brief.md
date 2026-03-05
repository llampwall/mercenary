# Operating Brief

## One-liner
- `mercenary` is a Node.js 22+ Windows-first CLI/module that standardizes subprocess lifecycle management for both Claude Code (`claude`) and OpenAI Codex CLI (`codex`).

## Goals
- Provide one reusable spawn primitive for direct CLI usage and downstream AllMind consumers.
- Enforce consistent safety defaults for env sanitization, timeout handling, process-tree cleanup, and backend-aware role presets.
- Keep implementation easy to vendor: zero dependencies in a single source file (`mercenary.js`).

## Non-goals
- Hosting an HTTP API server in this repository.
- Linux/macOS-first process orchestration.
- Persisting long-term conversational history beyond backend-native session semantics.

## Current state
- Working: one-shot mode (`run()` / `--prompt`) supports `claude` and `codex`, captures stdout/stderr, and returns timeout/duration metadata.
- Working: `run()` supports `--resume` and `--system-prompt` for Claude one-shot workflows.
- Working: interactive mode (`openSession()` / `--interactive`) supports both backends via generated PowerShell launchers in Windows Terminal.
- Working: headless persistent Claude sessions are available via `openHeadlessSession()` with stream-json I/O over stdio pipes.
- Working: role presets (`pipeline`, `allmind`, `coordinator`) are implemented with backend-specific behavior.
- Working: pipeline role enforces strict MCP isolation without hardcoded `mcp-none.json` fallback injection.
- Working: child env sanitization strips nested-session/auth vars and forces `SHELL` to pwsh path.
- Working: process ledger (`.process-ledger.json`) tracks spawned processes with `--ps`, `--audit`, and `--purge` lifecycle commands.
- Fragile: integration tests require local Claude availability and are skipped unless `MERCENARY_INTEGRATION=1`.
- Fragile: CI workflow is placeholder-only and does not run the test suite.
- Missing: release/versioning automation is not yet defined.

## Repo map
- `mercenary.js`: single implementation file (module exports + CLI entrypoint).
- `test/mercenary.test.js`: unit, CLI, ledger, and integration-gated tests.
- `docs/specs/mercenary.md`: behavior/specification reference.
- `README.md`: end-user CLI/API docs for Claude and Codex backends.
- `.process-ledger.json`: tracked process metadata for audit/purge workflows.
- `docs/project_notes/`: canonical project memory.

## System map
- Components:
  - Binary resolution: `resolveBinary`, `resolveClaudePath`, `resolveCodexPath`
  - One-shot execution: `run` + `buildArgs` (Claude) / `buildCodexArgs` (Codex)
  - Interactive execution: `openSession` / `openSessionCodex`
  - Headless persistent session: `openHeadlessSession`
  - Process lifecycle tracking: ledger read/write/audit/status/purge helpers
  - CLI routing: `parseArgs` + `main`
- Data flow:
  1) Caller invokes CLI or module API with backend and role options.
  2) Mercenary resolves binary path, sanitizes env, builds backend-specific args, and spawns child processes.
  3) One-shot mode captures output and enforces timeout via process-tree kill.
  4) Interactive mode writes launcher artifacts to per-session temp directories and opens Windows Terminal.
  5) Ledger APIs register, audit, and purge tracked PIDs across lifecycle operations.

## Active constraints
- ADR-001: Canonical project memory is `docs/project_notes/`.
- ADR-002: Windows-safe automation invocation and newline policy are mandatory.
- ADR-003: Mercenary remains a Windows-first single-file wrapper with required safety/env defaults.
- ADR-006: Interactive sessions must isolate child `TEMP`/`TMP` per session.
- ADR-007: Multi-backend contract (`claude` + `codex`) must remain explicit and deterministic.
- ADR-008: Spawned process lifecycle must be tracked in persistent ledger state.
- ADR-009: Headless persistent session mode is Claude-only and stream-json based.
- ADR-010: Pipeline strict MCP isolation must not rely on hardcoded machine-local fallback configs.

## Known hazards
- `--interactive` depends on `wt` and `pwsh` being installed and discoverable.
- Codex runs require Codex CLI installation and API auth env (`CODEX_API_KEY` or `OPENAI_API_KEY`).
- CLI parser ignores unknown flags; typos can silently skip intended behavior after warning.
- `openHeadlessSession()` currently assumes one active `send()` request at a time; concurrent sends can race.
- Placeholder CI can report green while runtime regressions exist.
- Interactive launchers create per-session temp directories that are not auto-pruned.

## Next steps
1) Replace placeholder CI workflow with real cross-backend test execution.
2) Add tests for `openHeadlessSession()` turn handling, concurrency guardrails, and shutdown behavior.
3) Add targeted tests for `--resume`/`--system-prompt` one-shot paths and backend-specific flag handling.
4) Define release/versioning workflow for distributing the CLI.
5) Add periodic maintenance guidance for stale temp launcher folders and ledger hygiene.

## How to get oriented fast
- Start here: `README.md`, then `docs/specs/mercenary.md`.
- Runbook: `test/mercenary.test.js`
- Key facts: `docs/project_notes/key_facts.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
- Bug playbook: `docs/project_notes/bugs.md`