<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Next: real CI, versioning workflow, role-preset test coverage, and Codex backend.

## Active Work
- Nothing in progress

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Add automated tests for role-based launch presets (`pipeline`, `coordinator`, `allmind`)
- [ ] Implement Codex backend (`--backend codex`) per `docs/plans/2026-02-27-codex-backend.md`

## Quick Reference
- Run: `node mercenary.js --prompt "test" --timeout 10`
- Test: `node test/mercenary.test.js`
- Interactive: `node mercenary.js --interactive`
- Headless: `openHeadlessSession(opts)` — persistent headless Claude via pipe
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-03-05
Commits covered through: cbe5118694a34e8444239a6e4f0889dd697f0827

<!-- chinvex:last-commit:cbe5118694a34e8444239a6e4f0889dd697f0827 -->
