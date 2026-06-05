<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Codex Phase 1 blockers resolved (hidden console cascade, native exe dual-path probe, model default gpt-5.5). Next: real CI, versioning workflow, remaining Codex integration test coverage.

## Active Work
- Uncommitted `mercenary.js`: adds `opts.env` passthrough so callers can merge arbitrary env vars into spawned processes (wins over base env)

## Blockers
- CI is placeholder-only — reports green without running tests
- openSession with local model + shell tools blocked by Qg7 sandbox gate on Windows; must route shell work through headless (`run()`)

## Next Actions
- [ ] Commit `opts.env` passthrough (uncommitted change in `mercenary.js`)
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
Last memory update: 2026-06-05
Commits covered through: aba9359b2227e74819b27bcc5948af65ed7ba47e

<!-- chinvex:last-commit:aba9359b2227e74819b27bcc5948af65ed7ba47e -->
