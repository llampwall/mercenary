<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Local-model feature complete. Codex Phase 1 blockers resolved (native exe dual-path probe + model default bump to gpt-5.5). Next: real CI, versioning workflow, remaining Codex integration test coverage.

## Active Work
- Nothing in progress

## Blockers
- CI is placeholder-only — reports green without running tests
- openSession with local model + shell tools blocked by Qg7 sandbox gate on Windows; must route shell work through headless (`run()`)

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
Last memory update: 2026-06-04
Commits covered through: 9be56fd175051569010b966baefc43156d9aa3a4

<!-- chinvex:last-commit:9be56fd175051569010b966baefc43156d9aa3a4 -->
