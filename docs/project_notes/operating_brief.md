# Operating Brief

## One-liner
- `mercenary` is a Windows-first Node.js 22+ CLI/module that wraps `claude` and `codex` with consistent subprocess safety, timeout handling, and lifecycle tracking.

## Goals
- Provide one reusable spawn primitive for direct CLI use and AllMind integrations.
- Keep backend behavior explicit (`claude` vs `codex`) while sharing common safety defaults.
- Stay vendor-friendly: single source file (`mercenary.js`), zero external dependencies.

## Non-goals
- Running an HTTP API service inside this repository.
- Linux/macOS-first orchestration.
- Managing secrets or long-term session history beyond backend-native behavior.

## Current state
- One-shot mode (`run()` / `--prompt`) supports `claude` and `codex`, captures stdout/stderr, and returns timing/timeout metadata.
- Claude one-shot supports `--resume`, `--system-prompt`, and falls back to stdin prompt piping when computed CLI arg length exceeds 20K chars.
- Interactive mode (`openSession()` / `--interactive`) supports both backends via generated PowerShell launchers in Windows Terminal tabs.
- Headless persistent Claude mode (`openHeadlessSession()`) is available over stream-json stdio.
- Role presets (`pipeline`, `allmind`, `coordinator`) are active with backend-specific defaults.
- Claude pipeline strict MCP mode uses `--strict-mcp-config` without injecting hardcoded fallback config paths.
- Process ledger (`.process-ledger.json`) tracks spawned processes and powers `--ps`, `--audit`, and `--purge`.
- Integration tests are opt-in (`MERCENARY_INTEGRATION=1`); CI workflow remains placeholder-only.

## Active constraints
- ADR-001: Canonical project memory is `docs/project_notes/`.
- ADR-002: Windows-safe script invocation and newline rules are mandatory.
- ADR-003: Mercenary remains dependency-free and centered in `mercenary.js`.
- ADR-005: Interactive sessions default `strictMcp` to `false`; strict MCP is explicit opt-in.
- ADR-006: Interactive sessions isolate child `TEMP`/`TMP` per session.
- ADR-007: Multi-backend contract (`claude` + `codex`) is explicit and deterministic.
- ADR-008: Every spawned process lifecycle is tracked in ledger state.
- ADR-009: Headless persistent session mode is Claude-only and stream-json based.
- ADR-010: Pipeline strict MCP isolation must not rely on hardcoded local fallback configs.

## Known hazards
- `--interactive` requires `wt` and `pwsh` on PATH.
- Codex usage requires Codex CLI install and auth env (`CODEX_API_KEY` or `OPENAI_API_KEY`).
- CLI parser ignores unknown flags; typoed options can be skipped after warning.
- `openHeadlessSession().send()` is currently single-flight; concurrent sends can race.
- Interactive launchers create per-session temp directories that are not auto-pruned.
- Placeholder CI can report green without exercising runtime behavior.

## Next steps
1. Replace placeholder CI workflow with real tests on Windows runners.
2. Add dedicated tests for `openHeadlessSession()` concurrency and shutdown behavior.
3. Add explicit tests for `run()` resume/system-prompt and long-prompt stdin fallback paths.
4. Define release/versioning workflow for publishing and changelog discipline.
5. Add maintenance guidance for stale temp launcher folders and ledger hygiene.

## Repo map
- `mercenary.js`: implementation, exports, and CLI entrypoint.
- `test/mercenary.test.js`: unit, CLI, ledger, and gated integration tests.
- `README.md`: usage and API reference.
- `docs/specs/mercenary.md`: historical design spec (contains legacy sections).
- `docs/project_notes/`: canonical project memory files.
