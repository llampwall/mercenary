<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Recent focus: the local-model (qwen) launch profile — `--thinking-display summarized` pinned on all three claude arg builders so NInfer stops 400ing the forced-json lanes, plus a new `opts.spawnLauncher` hook letting a caller host the one-shot spawn (AllMind runs an unattended worker at Low integrity through it). Next: real CI, versioning workflow, remaining Codex integration test coverage.

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
- Test: `node test/mercenary.test.js` (113 tests: 103 pass, 0 fail, 10 skipped — run 2026-09-12)
- Codex run: `node mercenary.js --prompt "test" --backend codex --timeout 10`
- Interactive: `node mercenary.js --interactive`
- Local model: `node mercenary.js --use-local-model --prompt "test"` (or `--backend qwen`)
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-09-12
Commits covered through: 3641f8f23ea2e231e0ceb2cffc7c7157105797ce

<!-- chinvex:last-commit:3641f8f23ea2e231e0ceb2cffc7c7157105797ce -->
