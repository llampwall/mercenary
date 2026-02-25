# Key Facts

## Quick start
- Install: `npm install` (no external runtime deps, but keeps local npm workflow consistent).
- Dev one-shot: `node mercenary.js --prompt "Reply with exactly: OK" --timeout 30`
- Dev interactive: `node mercenary.js --interactive --title "Mercenary"`
- Test: `npm test` (runs `node test/mercenary.test.js`).
- Lint: no lint command is defined in `package.json`.

## Local development
- Runtime: Node.js `>=22` (`package.json` engines).
- Package manager: npm.
- Module format: ESM (`"type": "module"`).
- Env var names:
  - `CLAUDE_PATH` (override Claude binary resolution).
  - `MERCENARY_INTEGRATION` (enables integration tests).
  - `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY` (removed from child env by design).
  - `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (set in child env; default `65536` unless overridden by `--max-tokens`).
  - `.env.example` names: `SERVER_HOST`, `SERVER_PORT`, `UI_HOST`, `UI_PORT`.
- Ports:
  - `.env.example`: server `6969`, UI `5174`.
- Common paths:
  - `mercenary.js` (single implementation file).
  - `test/mercenary.test.js` (unit/CLI/integration-gated tests).
  - `docs/specs/mercenary.md` (detailed behavior spec).
  - `P:\\software\\allmind\\data\\persona\\allmind-voice.md` (`--am` persona default).
  - `C:\\Users\\Jordan\\.local\\bin\\claude.exe` (known local Claude path fallback).

## Environments
- Dev: Windows host with `pwsh`, `wt`, and Claude CLI installed.
- Staging: not defined in this repository.
- Production: not defined in this repository.

## Deployment
- Build: none (single-file Node CLI, no transpile/bundle step).
- Deploy: no in-repo deployment pipeline; consumed directly as a local CLI/module.
- Rollback: `git revert` + re-run `npm test`.
- Health checks: manual CLI smoke run and test suite.

## Data and storage
- Primary datastore: none.
- Object storage: none.
- Backups: git history only.

## External services
- GitHub Actions workflow: `.github/workflows/ci.yml` (placeholder sanity job).
- Claude CLI executable: resolved via `CLAUDE_PATH`, then known path fallback, then `where.exe claude`.
- AllMind integration: Mercenary provides spawn primitives; API routes live in AllMind, not this repo.

## Observability
- Runtime output: stdout/stderr from spawned Claude process.
- Local logs directory: `logs/` (gitignored except `logs/.keep`).
- Metrics: none implemented.
- Alerts: none implemented.

## Repo map
- `.`: Node CLI/module repo with one source file and tests.
- `docs/project_notes/`: canonical memory notes.
- `docs/memory/`: legacy notes; non-canonical unless explicitly migrated.
- `scripts/` and `tools/`: required location for automation scripts.
- `.github/workflows/ci.yml`: placeholder CI workflow.

## Operational commands
- Run tests: `npm test`
- One-shot JSON run: `node mercenary.js --prompt "Reply with exactly: OK" --json --timeout 30`
- Open interactive session: `node mercenary.js --interactive --system-prompt .\\prompt.txt "Begin observing."`
- Kill an existing process tree: `node mercenary.js --kill <pid>`
- Search files: `rg --files`
- View recent commits: `git log --oneline -n 10`

## Deprecations and gotchas
- Keep `shell: false` for the main Claude process spawn path in `mercenary.js`.
- Interactive mode requires both Windows Terminal (`wt`) and PowerShell (`pwsh`).
- `pipeline` and `coordinator` presets intentionally default to strict MCP isolation.
- Line endings are LF by default; only `.bat`/`.cmd` use CRLF.
- Do not store secrets in repo notes or committed env files; document env var names only.

## Linkouts
- Operating brief: `docs/project_notes/operating_brief.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Bug playbook: `docs/project_notes/bugs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
