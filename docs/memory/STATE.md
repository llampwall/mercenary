<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Recent focus: the interactive local-model (qwen) launch profile — a six-tool allowlist plus strict MCP with no config so llama.cpp's grammar converter and the 131K rig window both hold, proven by a rig-gated live check. Next: real CI, versioning workflow, remaining Codex integration test coverage.

## Active Work
- None — all recent work committed

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Harden `readLedger()` against malformed JSON — a corrupt ledger currently crashes `--ps`/`--audit`/`--purge`
- [ ] Finish Codex backend surface + integration tests per `docs/plans/2026-02-27-codex-backend.md`
- [ ] Close the last one-builder gap: the PS1 interactive launcher still nulls named routing vars only, not the `ANTHROPIC_DEFAULT_*` wildcard the JS builders strip

## Quick Reference
- Run: `node mercenary.js --prompt "test" --timeout 10`
- Test: `node test/mercenary.test.js` (111 tests: 102 pass, 0 fail, 9 skipped — run 2026-09-05)
- Codex run: `node mercenary.js --prompt "test" --backend codex --timeout 10`
- Interactive: `node mercenary.js --interactive`
- Local model: `node mercenary.js --use-local-model --prompt "test"` (or `--backend qwen`)
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-09-05
Commits covered through: 6c1552510aa6cfeed79f7d75167fb5065e0c5b75

<!-- chinvex:last-commit:6c1552510aa6cfeed79f7d75167fb5065e0c5b75 -->
