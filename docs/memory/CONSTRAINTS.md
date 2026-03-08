<!-- DO: Add bullets. Edit existing bullets in place with (updated YYYY-MM-DD). -->
<!-- DON'T: Delete bullets. Don't write prose. Don't duplicate — search first. -->

# Constraints

## Infrastructure
- Runtime: Node.js 22+ ESM (`"type": "module"` in package.json)
- Single file: `mercenary.js` — no build step, no bundler
- Zero external dependencies — Node.js stdlib only
- Windows-only: depends on `wt` (Windows Terminal) and `pwsh` for interactive mode
- Process tree kill via `taskkill /T /F /PID` — no Unix `kill` signal chains
- Canonical project memory: `docs/project_notes/` (ADR-001); `docs/memory/` is legacy/non-canonical
- Windows CLI arg limit: 32,767 chars; `run()` switches to stdin piping when `estimateArgLength(spawnArgs) > 20K` (`SAFE_CLI_CHARS`) to avoid truncation (added 2026-03-06)

## Rules
- Always set `--dangerously-skip-permissions` on every spawned claude process (updated 2026-02-25)
- `--no-session-persistence` applies only to one-shot `-p` launches; do NOT pass it to `openSession()` interactive sessions (updated 2026-02-25)
- Always delete `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY` from child env
- Force `SHELL=pwsh` in `sanitizeEnv()` and in `openSession()` launcher to prevent PM2-inherited bash.exe (updated 2026-02-25)
- Use `shell: false` with resolved claude binary path — never rely on shell PATH lookup
- `pipeline` role uses `--strict-mcp-config` only; no `mcp-none.json` fallback injected (global mcpServers is empty) (updated 2026-02-26)
- Interactive sessions (`openSession()`) must NOT use `--strict-mcp-config` — causes Claude to hang silently; default `strictMcp: false` for interactive (updated 2026-02-25)
- Each `openSession()` must set child `TEMP`/`TMP` to its mkdtemp dir to prevent EINVAL from shared task output directory collisions (updated 2026-02-25)
- Automation scripts must live in `scripts/` or `tools/`
- LF line endings everywhere; only `.bat` and `.cmd` may use CRLF (enforced by `.editorconfig` and `.gitattributes`)
- Multiline content edits must use direct file edits — no ad-hoc Python/regex replacement scripts
- When `--resume <id>` is used, `--no-session-persistence` must NOT be passed (resume requires session persistence) (updated 2026-03-05)
- Use `appendSystemPrompt`/`--append-system-prompt` for persona injection; only use `--system-prompt` when the full default system prompt must be replaced (updated 2026-03-05)
- Codex one-shot defaults: `--dangerously-bypass-approvals-and-sandbox --ephemeral` unless `sandbox` is explicitly provided (added 2026-03-08)
- On Windows, `resolveCodexPath()` attempts to resolve the native `.exe` via `resolveCodexNativeExecutable()` before falling back to the `.cmd` shim — never spawn the `.cmd` shim when `.exe` is available (added 2026-03-07)
- `shouldDisableCodexMcp(opts, mode)` controls per-run MCP disable for Codex: pipeline/streaming/allmind one-shot default to disabled; coordinator/allmind interactive default to disabled; explicit `opts.disableMcp` overrides all (added 2026-03-07)
- `getDefaultCodexSandbox(opts, mode)` sets sandbox default: pipeline/streaming one-shot → `workspace-write`; coordinator interactive → `workspace-write`; others → none (added 2026-03-07)

## Key Facts
- CLI entry: `node mercenary.js --prompt "..." --timeout N`
- Interactive entry: `node mercenary.js --interactive`
- Test command: `node test/mercenary.test.js`
- Integration tests gated behind env var: `MERCENARY_INTEGRATION=1`
- AllMind persona path: `P:\software\allmind\data\persona\allmind-voice.md` (used by `--am` / `role:'allmind'`)
- Claude role presets: `pipeline` → `--output-format stream-json --verbose` + `--strict-mcp-config`; `coordinator` → `--allowed-tools Bash,Read,Edit,Write,Glob,Grep` + `strictMcp:true` in openSession; `allmind` → `--output-format text` + persona (updated 2026-02-26)
- Codex role presets: `pipeline` → `workspace-write` sandbox + MCP disabled; `allmind` one-shot → MCP disabled; `coordinator`/`allmind` interactive → MCP disabled; explicit `opts.disableMcp` or `opts.sandbox` overrides (added 2026-03-08)
- SHELL is forced to `pwsh` (the App Execution Alias); bash.exe assignment was incorrect, caused by a broken Claude Code update (updated 2026-02-26)
- `.claude/settings.json` runs a chinvex SessionStart hook that delivers a session brief; `ACTION REQUIRED` in brief means memory files need updating via `/update-memory`
- Codex backend plan: `docs/plans/2026-02-27-codex-backend.md` — routes subprocess calls through `codex exec` instead of `claude` when `opts.backend='codex'`
- `openHeadlessSession(opts)` — persistent headless Claude session via stdin/stdout pipe; does not open a terminal window (updated 2026-03-05)
- `--resume <id>` option in `run()` — enables session continuity; strips `--no-session-persistence` and passes `--resume <id>` to claude CLI (updated 2026-03-05)

## Hazards
- `--interactive` silently fails if `wt` or `pwsh` are not installed/discoverable on PATH
- Built-in claude binary path is user-specific; set `CLAUDE_PATH` env var on other hosts
- Placeholder CI always reports green — runtime regressions can go undetected
- Integration tests are skipped unless `MERCENARY_INTEGRATION=1` is set — easy to miss real breakage
- `--strict-mcp-config` in interactive (`openSession`) mode causes Claude to hang silently without error — interactive must use `strictMcp: false` (updated 2026-02-25)
- Without MCP suppression, pipeline/coordinator spawns can generate ~40 conhost popup windows on Windows (updated 2026-02-25)
- Passing `--no-session-persistence` to `openSession()` (interactive) crashes or misbehaves — only valid for `-p` one-shot mode (updated 2026-02-25)

## Superseded
- (Superseded 2026-02-26) MCP fallback config path `mcp-none.json` — global mcpServers is now empty, fallback removed (18c991f)
