<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete; per-spawn settings override and local-model compaction window landed. Next: real CI, versioning workflow, remaining Codex integration test coverage.

## Active Work
- None — all recent work committed

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Extend routing-var strip to `sanitizeEnvCodex` and `buildLauncherEnvLines` (only `sanitizeEnv` is covered)
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Harden `readLedger()` against malformed JSON — a corrupt ledger currently crashes `--ps`/`--audit`/`--purge`
- [ ] Finish Codex backend surface + integration tests per `docs/plans/2026-02-27-codex-backend.md`

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
Last memory update: 2026-08-18
Commits covered through: 9f61c4228d00906b25827f728d69c42ff195a01a

<!-- chinvex:last-commit:9f61c4228d00906b25827f728d69c42ff195a01a -->
