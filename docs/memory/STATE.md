<!-- DO: Rewrite freely. Keep under 30 lines. Current truth only. -->
<!-- DON'T: Add history, rationale, or speculation. No "we used to..." -->

# State

## Current Objective
Core implementation complete. Next: real CI, versioning workflow, role-preset test coverage.

## Active Work
- Nothing in progress (last commits were MCP/SHELL cleanup fixes)

## Blockers
- CI is placeholder-only — reports green without running tests

## Next Actions
- [ ] Replace placeholder CI with real test execution (Windows runner)
- [ ] Define release/versioning workflow for `mercenary` CLI distribution
- [ ] Add automated tests for role-based launch presets (`pipeline`, `coordinator`, `allmind`)

## Quick Reference
- Run: `node mercenary.js --prompt "test" --timeout 10`
- Test: `node test/mercenary.test.js`
- Interactive: `node mercenary.js --interactive`
- Entry point: `mercenary.js`

## Out of Scope (for now)
- HTTP API server in this repo
- Linux/macOS process orchestration

---
Last memory update: 2026-02-28
Commits covered through: 5ab0acd28d488b1901ecddc59580b0aee92d7cb5

<!-- chinvex:last-commit:5ab0acd28d488b1901ecddc59580b0aee92d7cb5 -->
