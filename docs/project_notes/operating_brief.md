# Operating Brief

## One-liner
- `mercenary` is a Node.js 22+ Windows-first CLI/module that standardizes Claude CLI subprocess lifecycle for one-shot automation and visible interactive workflows.

## Goals
- Provide one reusable spawn primitive for direct CLI usage and downstream AllMind consumers.
- Enforce consistent safety defaults for flags, env sanitization, timeout handling, and process-tree cleanup.
- Keep implementation easy to vendor: zero dependencies in a single source file (`mercenary.js`).

## Non-goals
- Hosting an HTTP API server in this repository.
- Supporting Linux/macOS process orchestration in the current implementation.
- Persisting long-running session state or crash recovery.

## Current state
- Working: one-shot mode (`run()` / `--prompt`) resolves Claude path, captures stdout/stderr, and returns timeout/duration metadata.
- Working: one-shot `pipeline` preset enforces strict MCP isolation and defaults `--mcp-config` to `P:\\software\\allmind\\config\\mcp-none.json` when no config is provided.
- Working: interactive mode (`openSession()` / `--interactive`) launches Windows Terminal via generated PowerShell launcher script with startup diagnostics.
- Working: interactive prompt payloads are loaded from temp files into PowerShell variables before launch to avoid inline subexpression parsing issues.
- Working: interactive launches isolate child `TEMP`/`TMP` to each session `mkdtemp` directory to prevent cross-session temp-file collisions (`EINVAL` class failures).
- Working: role-based presets (`pipeline`, `allmind`, `coordinator`) are implemented.
- Working: child env sanitization strips nested-session/auth vars and forces `SHELL=pwsh` for Windows consistency.
- Fragile: CI is placeholder-only and does not execute tests.
- Fragile: integration tests require local Claude availability and are skipped unless `MERCENARY_INTEGRATION=1`.
- Missing: release/versioning automation is not yet defined.

## Repo map
- `mercenary.js`: single implementation file (module exports + CLI entrypoint).
- `test/mercenary.test.js`: unit, CLI, and gated integration tests.
- `package.json`: Node engine requirement, test script, and CLI bin mapping.
- `docs/specs/mercenary.md`: behavior/specification reference.
- `AGENTS.md` and `CLAUDE.md`: maintainer guardrails and assistant operating rules.
- `docs/project_notes/`: canonical project memory.

## System map
- Components:
  - Process wrapper: `run`, `openSession`, `treeKill`, `resolveClaudePath`
  - CLI execution path: `parseArgs` plus mode routing (`--prompt`, `--interactive`, `--kill`)
  - Role preset layer: one-shot preset handling in `buildArgs()` and interactive defaults in `openSession()`
  - Test layer: `node:test` suite covering exports, parser behavior, kill behavior, and integration gates
- Data flow:
  1) Caller invokes CLI or imports module API.
  2) Mercenary resolves `claude` path, sanitizes env, builds mode-specific args, and spawns child process.
  3) One-shot mode buffers output and enforces timeout with process-tree kill.
  4) Interactive mode writes launcher artifacts to temp and opens `wt` + `pwsh`.

## Active constraints
- ADR-001: Canonical project memory is `docs/project_notes/`.
- ADR-002: Windows-safe automation invocation and newline policy are mandatory.
- ADR-003: Mercenary remains a Windows-first single-file wrapper with mode-specific launch flags and required env sanitization.
- ADR-005: `pipeline` defaults to strict MCP isolation; interactive sessions require explicit strict-MCP opt-in.
- ADR-006: Interactive sessions must isolate child `TEMP`/`TMP` to per-session directories.

## Known hazards
- `--interactive` depends on `wt` and `pwsh` being installed and discoverable.
- Enabling `strictMcp` in interactive sessions can still hang in some environments; treat it as opt-in and smoke test before broad rollout.
- Built-in default paths (`KNOWN_CLAUDE_PATH`, AllMind persona path, and default `mcp-none.json`) are machine-specific; use overrides (`CLAUDE_PATH`, `--persona`, `--mcp-config`) on other hosts.
- Placeholder CI can report green while runtime regressions exist.
- Interactive sessions currently do not prune their per-session `mercenary-*` temp directories automatically.

## Next steps
1) Replace placeholder CI with real test execution, including Windows coverage.
2) Define release/versioning workflow for distributing the `mercenary` CLI.
3) Add targeted automated checks for role preset behavior (`strictMcp`, `mcpConfig`, callbacks, and output defaults), including interactive strict-MCP opt-in behavior.
4) Add a cleanup strategy for stale per-session temp directories created by interactive mode.

## How to get oriented fast
- Start here: `README.md`, then `docs/specs/mercenary.md`.
- Runbook: `test/mercenary.test.js`
- Key facts: `docs/project_notes/key_facts.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
- Bug playbook: `docs/project_notes/bugs.md`
