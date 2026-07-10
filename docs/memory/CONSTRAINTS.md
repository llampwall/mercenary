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
- Always delete `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR` from child env — exception: in local-model branch, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` are PRESERVED to match the env shape of an interactive CC session (updated 2026-07-09)
- Force `SHELL=pwsh` in `sanitizeEnv()` and in `openSession()` launcher to prevent PM2-inherited bash.exe (updated 2026-02-25)
- Use `shell: false` with resolved claude binary path — never rely on shell PATH lookup
- `pipeline` role uses `--strict-mcp-config` only; no `mcp-none.json` fallback injected (global mcpServers is empty) (updated 2026-02-26)
- Interactive sessions (`openSession()`) must NOT use `--strict-mcp-config` — causes Claude to hang silently; default `strictMcp: false` for interactive (updated 2026-02-25)
- Each `openSession()` must set child `TEMP`/`TMP` to its mkdtemp dir to prevent EINVAL from shared task output directory collisions (updated 2026-02-25)
- Automation scripts must live in `scripts/` or `tools/`
- LF line endings everywhere; only `.bat` and `.cmd` may use CRLF (enforced by `.editorconfig` and `.gitattributes`)
- Multiline content edits must use direct file edits — no ad-hoc Python/regex replacement scripts
- When `--resume <id>` is used, `--no-session-persistence` must NOT be passed (resume requires session persistence) (updated 2026-03-05)
- `--session-id <uuid>` strips `--no-session-persistence` and passes `--session-id <uuid>` to claude CLI; same session-persistence pattern as `--resume` (added 2026-03-12)
- Use `appendSystemPrompt`/`--append-system-prompt` for persona injection; only use `--system-prompt` when the full default system prompt must be replaced (updated 2026-03-05)
- Codex one-shot defaults: `--dangerously-bypass-approvals-and-sandbox --ephemeral` unless `sandbox` is explicitly provided (added 2026-03-08)
- On Windows, `resolveCodexPath()` attempts to resolve the native `.exe` via `resolveCodexNativeExecutable()` before falling back to the `.cmd` shim — never spawn the `.cmd` shim when `.exe` is available; `resolveCodexNativeExecutable()` probes both `vendor/<triple>/bin/codex.exe` (current layout) and `vendor/<triple>/codex/codex.exe` (legacy layout) (updated 2026-06-04)
- `shouldDisableCodexMcp(opts, mode)` controls per-run MCP disable for Codex: pipeline/streaming/allmind one-shot default to disabled; coordinator/allmind interactive default to disabled; explicit `opts.disableMcp` overrides all (added 2026-03-07)
- `getDefaultCodexSandbox(opts, mode)` sets sandbox default: pipeline/streaming one-shot → `workspace-write`; coordinator interactive → `workspace-write`; others → none (added 2026-03-07)
- `repo-agent` role is a pipeline alias: identical behavior (stream-json, `--strict-mcp-config`, MCP disabled, `workspace-write` sandbox for Codex) (added 2026-03-11)
- When `dispatchId` is passed to `openSession()`, the launcher sets `$env:ALLMIND_DISPATCH_ID` in the child env and POSTs `mercenary_session_exit` to AllMind `/api/internal/event` after Claude exits; exit hook POST body includes `thread_id` in details when spawned with an origin thread; a fire-and-forget background job also finds the real `claude.exe` PID (Get-CimInstance child of launcher $PID, name claude*) and POSTs to `/api/internal/ledger/update-pid` — on failure the ledger retains the launcher PID (updated 2026-06-27)
- All spawn paths (`run()`, `openSession()`, `openHeadlessSession()`) warn to stderr when `purpose` or `origin` are not provided — callers must supply both for traceability (added 2026-03-21)
- `appendSystemPrompt` content >8K chars must be written to a temp file; use `--append-system-prompt-file <path>` (or `--system-prompt-file`) instead of inline flag to avoid Windows ENAMETOOLONG / CLI arg truncation — applies to ALL spawn paths (`run()`, `openSession()`, `openHeadlessSession()`); never load temp file content back into a PowerShell variable and expand inline (updated 2026-04-28)
- When `useLocalModel` is set on a spawn, `ANTHROPIC_BASE_URL` and `ALLMIND_LOCAL_MODEL=1` are both injected into the child env; other spawns are unaffected (updated 2026-04-30)
- Never set `ANTHROPIC_AUTH_TOKEN` on local-model spawns — flips Claude into API-billing mode which trips the enterprise sandbox gate on Windows (added 2026-05-08)
- Never set `ANTHROPIC_MODEL` env var on local-model spawns — empirically ignored on 2.1.132 for model selection but triggers API-billing banner; use `--model` flag instead (added 2026-05-08)
- `sanitizeEnv()` strips `ANTHROPIC_MODEL` defensively on all spawn paths (added 2026-05-08)
- Both launcher.ps1 templates (run + openSession) must explicitly null `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_MODEL`, and set `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` + `CLAUDE_CODE_REMOTE=1` for local-model spawns (added 2026-05-08)
- `data/claude-local-model-settings.json` is injected via `--settings` for all local-model spawn paths; `--local-model-settings-path` CLI flag overrides the default path (added 2026-05-08)
- `openSession()` with `useLocalModel` on win32: shell tools are blocked by the Qg7 sandbox gate; uses allowedTools override (Read,Edit,Write,Glob,Grep) + append-system-prompt notice instead of throwing — shell-needing work must route through `run()` / headless (updated 2026-05-08)
- `buildCodexArgs` always passes `--model` explicitly; never rely on the Codex CLI's built-in default — it changes between Codex versions and may be rejected with "requires newer version of Codex"; pinned default is `gpt-5.5` (confirmed on Codex CLI 0.133.0) (updated 2026-06-04)
- `opts.initialMessage` in `openSession()` (both claude and codex interactive launchers) is written to `initial-message.txt` in the spawn tmpdir, loaded via `Get-Content -Raw` into a PS variable, then passed as a bare positional arg — same pattern as codex's `developer_instructions` config value. This is a deliberate, narrow exception to the "never load temp file content back into a PS variable" rule below: it exists to dodge PowerShell string-escaping bugs (live backticks, `$` interpolation) in the old inline double-quoted form, not CLI length — safe only because initial messages/dev instructions are expected to stay well under the argv length ceiling; large content (e.g. system prompts) must still use the `-file` flag variant (added 2026-07-07)
- Codex spawns must use `detached: false` (`detached: backend !== 'codex'`) — `windowsHide` is silently dropped by node when `detached: true` on win32 (node#21825), causing codex's child tree (pwsh, git.exe, conhost) to inherit a visible console and pop windows (added 2026-06-05)

## Key Facts
- `opts.env` — caller-supplied env map; merges last (caller wins over base sanitized env) in all spawn paths including codex (`sanitizeEnvCodex`); all entries are also baked into the interactive launcher PS1 (`openSession`) as `$env:KEY = "value"` lines using `escapePowerShellString` — previously only `ALLMIND_DISPATCH_ID` was baked, all other opts.env vars were silently dropped; used by AllMind to inject `ALLMIND_THREAD_ID` / `ALLMIND_ORIGIN_THREAD_ID` (updated 2026-06-21)
- `opts.codexConfigOverrides` — array of raw TOML key=value strings forwarded as `codex --config <entry>` (one arg per entry, cwd-independent); one-shot passes as-is (`shell:false`); interactive launcher wraps each in PowerShell-safe quotes; AllMind uses this to inject MCP server tables for repo-scoped codex Mind turns (added 2026-06-13)
- CLI entry: `node mercenary.js --prompt "..." --timeout N`
- Interactive entry: `node mercenary.js --interactive`
- Test command: `node test/mercenary.test.js`
- Integration tests gated behind env var: `MERCENARY_INTEGRATION=1`
- AllMind persona path: `P:\software\allmind\config\persona\allmind-voice.md` (used by `--am` / `role:'allmind'`)
- Claude role presets: `pipeline` → `--output-format stream-json --verbose` + `--strict-mcp-config`; `coordinator` → `--allowed-tools Bash,Read,Edit,Write,Glob,Grep` + `strictMcp:true` in openSession; `allmind` → `--output-format text` + persona (updated 2026-02-26)
- Codex role presets: `pipeline` → `workspace-write` sandbox + MCP disabled; `allmind` one-shot → MCP disabled; `coordinator`/`allmind` interactive → MCP disabled; explicit `opts.disableMcp` or `opts.sandbox` overrides (added 2026-03-08)
- SHELL is forced to `pwsh` (the App Execution Alias); bash.exe assignment was incorrect, caused by a broken Claude Code update (updated 2026-02-26)
- `.claude/settings.json` runs a chinvex SessionStart hook that delivers a session brief; `ACTION REQUIRED` in brief means memory files need updating via `/update-memory`
- Codex backend plan: `docs/plans/2026-02-27-codex-backend.md` — routes subprocess calls through `codex exec` instead of `claude` when `opts.backend='codex'`
- `openHeadlessSession(opts)` — persistent headless Claude session via stdin/stdout pipe; does not open a terminal window (updated 2026-03-05)
- Process ledger (`.process-ledger.json`) tracks `purpose` (task description) and `origin` (spawner identity) for every spawned process; both fields show in `--ps`/`--audit` output (added 2026-03-21)
- `--resume <id>` option in `run()` — enables session continuity; strips `--no-session-persistence` and passes `--resume <id>` to claude CLI (updated 2026-03-05)
- `--session-id <uuid>` option in `run()` / CLI — attaches to a named session; strips `--no-session-persistence` and passes `--session-id <uuid>` to claude CLI (added 2026-03-12)
- Concept-to-files lookup table at `docs/sys/lookup.json` — check this before grep/glob searches (added 2026-04-17)
- `useLocalModel: true` routes spawn through local LiteLLM proxy at `http://127.0.0.1:4000` by default; `localModelUrl` overrides the URL — available on `run()`, `openSession()`, `openHeadlessSession()`; also sets `ALLMIND_LOCAL_MODEL=1` in child env; injects `--settings data/claude-local-model-settings.json` (updated 2026-05-08)
- `opts.launch(ctx)` — optional callback on `openSession()`; when supplied, receives `{launcherPath, title, cwd, pwsh}` and hosts the generated launcher itself (e.g. an AllMind Herdr pane) instead of spawning `wt.exe`; any extra fields it returns (`pane_id`, `tab_id`, …) merge into `openSession()`'s return value alongside `{pid, title, launcherPath}`; omitted (default) preserves wt.exe spawn byte-for-byte (added 2026-07-01)
- CLI flags `--use-local-model` / `--local-model-url <url>` / `--local-model-settings-path <path>` accepted at CLI entry; snake_case and camelCase aliases both parsed (updated 2026-05-08)
- `data/claude-local-model-settings.json`: defensive Bash-deny + force PowerShell tool config for local-model spawns (added 2026-05-08)

## Hazards
- `--interactive` silently fails if `wt` or `pwsh` are not installed/discoverable on PATH
- Built-in claude binary path is user-specific; set `CLAUDE_PATH` env var on other hosts
- Placeholder CI always reports green — runtime regressions can go undetected
- Integration tests are skipped unless `MERCENARY_INTEGRATION=1` is set — easy to miss real breakage
- `--strict-mcp-config` in interactive (`openSession`) mode causes Claude to hang silently without error — interactive must use `strictMcp: false` (updated 2026-02-25)
- Without MCP suppression, pipeline/coordinator spawns can generate ~40 conhost popup windows on Windows (updated 2026-02-25)
- Passing `--no-session-persistence` to `openSession()` (interactive) crashes or misbehaves — only valid for `-p` one-shot mode (updated 2026-02-25)
- Claude Code 2.1.88+ requires stdin input within ~3s when using stream-json pipe mode (`openHeadlessSession()`); failing to send stdin quickly enough causes a silent startup hang (added 2026-04-17)
- PowerShell launcher: writing a prompt to a temp file then loading it back with `Get-Content` and expanding inline (`--flag $content`) defeats the purpose — PowerShell expands the variable into argv at CreateProcess(), hitting the Windows CLI length limit; always pass the file path via the `-file` flag variant (added 2026-04-28)
- Local-model `openSession()` on win32: shell tool invocations (not init) trigger the Qg7 sandbox gate with non-Anthropic `ANTHROPIC_BASE_URL`; read/edit/refactor work is fine via allowedTools override, but shell-needing work must use `run()` / `openHeadlessSession()` until upstream Claude Code fixes the gate (added 2026-05-08)
- `ANTHROPIC_AUTH_TOKEN=not-needed` (or any value) flips Claude Code into API-billing mode on Windows — the enterprise sandbox gate fires and the session fails; never set this env var for local-model spawns (added 2026-05-08)
- `Read-Host` or any interactive pause in a generated launcher.ps1 blocks every `openSession()` dispatch — the terminal window waits for operator Enter and the session never progresses; never leave diagnostic pauses in launcher templates (added 2026-05-09)
- Codex CLI's built-in default model changes between versions; `buildCodexArgs` pins `gpt-5.5` (confirmed on Codex CLI 0.133.0) and always passes `--model` — if a future release rejects this, bump `DEFAULT_CODEX_MODEL` and validate before deploying (updated 2026-06-04)
- `.cmd` test helper scripts fail with EINVAL when spawned with `windowsHide: true` + `detached: true` on Windows; use `.js` helpers via `node` instead (added 2026-05-18)
- On win32, `windowsHide` is silently dropped when `detached: true` (node#21825) — codex spawns must use `detached: false` so `windowsHide: true` is honored and codex gets a hidden console; treeKill still works via `taskkill /T /F /PID` (added 2026-06-05)
- A leaked `CLAUDE_CONFIG_DIR` in the parent env redirects a spawned claude child to a different login's credentials — `sanitizeEnv()` strips it on every claude spawn path; `sanitizeEnvCodex` is untouched since codex does not read this var (added 2026-07-09)

## Superseded
- (Superseded 2026-02-26) MCP fallback config path `mcp-none.json` — global mcpServers is now empty, fallback removed (18c991f)
