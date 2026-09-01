<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Recent focus: closing Windows argv-length holes on the codex spawn paths and keeping the local-model (qwen) profile correct for the rig. Next: real CI, versioning workflow, remaining Codex integration test coverage.

## Active Work
- None — all recent work committed

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Harden `readLedger()` against malformed JSON — a corrupt ledger currently crashes `--ps`/`--audit`/`--purge`
- [ ] Finish Codex backend surface + integration tests per `docs/plans/2026-02-27-codex-backend.md`
- [ ] Audit spawn paths for fixes that landed on only one builder — codex one-shot vs interactive argv, and the `ANTHROPIC_DEFAULT_*` wildcard null the PS1 launcher still lacks

## Quick Reference
- Run: `node mercenary.js --prompt "test" --timeout 10`
- Test: `node test/mercenary.test.js`
- Codex run: `node mercenary.js --prompt "test" --backend codex --timeout 10`
- Interactive: `node mercenary.js --interactive`
- Local model: `node mercenary.js --use-local-model --prompt "test"` (or `--backend qwen`)
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-09-01
Commits covered through: 64d7a8c2c9397076e1878bf4a27cc6b67d843605

<!-- chinvex:last-commit:64d7a8c2c9397076e1878bf4a27cc6b67d843605 -->
