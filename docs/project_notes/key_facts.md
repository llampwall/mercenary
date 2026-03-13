# Key Facts

## Quick start
- Install: `npm install`
- One-shot (Claude default): `node mercenary.js --prompt "Reply with exactly: OK" --timeout 30`
- One-shot (Codex): `node mercenary.js --prompt "Reply with exactly: OK" --backend codex --timeout 30`
- JSON result mode: `node mercenary.js --prompt "Reply with exactly: OK" --json --timeout 30`
- Interactive tab: `node mercenary.js --interactive --title "Mercenary"`
- Tests: `npm test` (runs `node test/mercenary.test.js`)
- Integration tests: `$env:MERCENARY_INTEGRATION=1; npm test`

## Local development
- Runtime: Node.js `>=22`
- Module format: ESM (`"type": "module"`)
- Package manager: npm
- Lint command: none defined in `package.json`

## Environment variable names
- Binary resolution:
  - `CLAUDE_PATH`
  - `CODEX_PATH`
- Backend auth:
  - `CODEX_API_KEY`
  - `OPENAI_API_KEY`
- Test gate:
  - `MERCENARY_INTEGRATION`
- Child env behavior:
  - Forced: `SHELL` -> `C:\Users\Jordan\AppData\Local\Microsoft\WindowsApps\pwsh.exe`
  - Claude child sets: `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (default `65536` or `--max-tokens`)
  - Removed from child env: `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY`
- Interactive temp isolation:
  - `TEMP`, `TMP` are set to per-session temp directories in interactive Claude launches
- `.env.example` placeholders:
  - `SERVER_HOST`, `SERVER_PORT`, `UI_HOST`, `UI_PORT`

## Paths
- Core implementation: `mercenary.js`
- Tests: `test/mercenary.test.js`
- Behavior spec: `docs/specs/mercenary.md`
- Canonical notes: `docs/project_notes/`
- Process ledger file: `.process-ledger.json`
- AllMind persona file for `--am`: `P:\software\allmind\config\persona\allmind-voice.md`
- Known Claude fallback path: `C:\Users\Jordan\.local\bin\claude.exe`
- Interactive temp workspaces: `%TEMP%\mercenary-*`

## Runtime and platform facts
- Platform target is Windows (`taskkill`, `wt`, `pwsh` usage in code paths).
- Mercenary runtime does not bind network ports.
- `.env.example` contains template values only (`6969`, `5174`), not active runtime ports.
- Main spawn paths use `shell: false`.

## CI and deployment
- CI workflow: `.github/workflows/ci.yml` currently runs a placeholder sanity echo.
- Build step: none (single-file Node CLI/module).
- Deploy model: local CLI/module consumption; no in-repo production pipeline.

## Operational commands
- Run tests: `npm test`
- Show tracked processes: `node mercenary.js --ps`
- Audit processes and discover orphans: `node mercenary.js --audit`
- Purge tracked processes: `node mercenary.js --purge`
- Kill a process tree: `node mercenary.js --kill <pid>`
- Sample module call:
  - `node --input-type=module -e "import { run } from './mercenary.js'; run({ prompt: 'Reply with exactly: OK', role: 'pipeline', timeout: 30 }).then(r => console.log(r.exitCode));"`

## Gotchas
- Interactive mode requires both Windows Terminal (`wt`) and PowerShell (`pwsh`) on PATH.
- `pipeline` role on Claude enforces strict MCP isolation via `--strict-mcp-config`; no hardcoded fallback MCP config is injected.
- Interactive mode defaults `strictMcp` to `false`; strict mode is explicit opt-in.
- Codex backend ignores Claude-only options such as `allowedTools`, `maxTurns`, `mcpConfig`, and `strictMcp`.
- Do not store secrets in notes; document env var names and secret injection locations only.

## Linkouts
- `docs/project_notes/operating_brief.md`
- `docs/project_notes/adrs.md`
- `docs/project_notes/bugs.md`
- `docs/project_notes/worklog.md`
