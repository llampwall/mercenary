# Key Facts

## Quick start
- Install: no package/runtime manifest is committed yet (`package.json`, `pyproject.toml`, `go.mod`, and similar files are absent).
- Dev: no project dev command is defined yet.
- Test: no project test command is defined yet.
- Lint: no project lint command is defined yet.

## Local development
- Runtime: not selected yet.
- Package manager: not selected yet.
- Env var names (`.env.example`): `SERVER_HOST`, `SERVER_PORT`, `UI_HOST`, `UI_PORT`.
- Ports (`.env.example`): server `6969`, UI `5174`.
- Common paths:
  - `scripts/` and `tools/` for automation code.
  - `logs/` for runtime logs (gitignored except `.keep`).
  - `docs/project_notes/` for canonical project memory.

## Environments
- Local/dev configuration is expected through `.env` / `.env.*` files (`.gitignore` excludes them).
- Staging and production targets are not declared in the repository yet.

## Deployment
- Build pipeline: not implemented yet.
- Deploy process: not implemented yet.
- Rollback process: not documented yet.
- Health checks: not implemented yet.

## Data and storage
- Primary datastore: none declared yet.
- Object storage: none declared yet.
- Backup strategy: none declared yet.

## External services
- Current external integration: GitHub Actions CI via `.github/workflows/ci.yml`.
- API endpoints: none declared yet.
- Service identities: none declared yet.

## Observability
- Logs: local logs written under `logs/` (directory ignored by default).
- Metrics: none declared yet.
- Alerts: none declared yet.

## Repo map
- `.`: root contains repo policy files, placeholder CI, and docs scaffolding.
- `docs/project_notes/`: canonical notes (`operating_brief.md`, `key_facts.md`, `adrs.md`, `bugs.md`, `worklog.md`).
- `docs/memory/`: legacy notes from older format; treat as non-canonical unless migrated.
- `.github/workflows/ci.yml`: CI placeholder.

## Operational commands
- List root files: `Get-ChildItem -Force -Name`
- Search files quickly: `rg --files`
- View recent commit(s): `git log --oneline -n 10`
- On Windows, if a `.ps1` sibling exists, run it with: `pwsh -File scripts\\task.ps1`

## Deprecations and gotchas
- Line endings are LF by default (`.editorconfig`, `.gitattributes`); only `.bat` and `.cmd` should use CRLF.
- Avoid ad-hoc Python/regex newline replacement edits; edit multiline content directly and verify.
- Do not store secrets in repo notes or committed env files; only env var names belong here.

## Linkouts
- Operating brief: `docs/project_notes/operating_brief.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Bug playbook: `docs/project_notes/bugs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
