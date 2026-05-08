<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Codex backend substantially implemented. Next: real CI, versioning workflow, Codex integration test coverage.

## Active Work
- Nothing in progress

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Add integration tests for Codex backend (MCP disable, sandbox defaults, native exe)
- [ ] Finish remaining Codex backend surface per `docs/plans/2026-02-27-codex-backend.md`

## Quick Reference
- Run: `node mercenary.js --prompt "test" --timeout 10`
- Test: `node test/mercenary.test.js`
- Codex run: `node mercenary.js --prompt "test" --backend codex --timeout 10`
- Interactive: `node mercenary.js --interactive`
- Local model: `node mercenary.js --use-local-model --prompt "test"`
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-05-01
Commits covered through: 022055d0e7749ec0b0cd2e6c02fe52cf018d97e2

<!-- chinvex:last-commit:022055d0e7749ec0b0cd2e6c02fe52cf018d97e2 -->
