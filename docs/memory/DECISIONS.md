<!-- DO: Append new entries to current month. Rewrite Recent rollup. -->
<!-- DON'T: Edit or delete old entries. Don't log trivial changes. -->

# Decisions

## Recent (last 30 days)
- Baked all `opts.env` entries into the interactive launcher PS1; exit hook now includes `thread_id` in POST body when spawned with an origin thread — previously only ALLMIND_DISPATCH_ID was baked; other opts.env vars (e.g. ALLMIND_ORIGIN_THREAD_ID) were silently dropped
- Added `opts.codexConfigOverrides`: array of raw TOML key=value strings forwarded as `codex --config <entry>` per arg; cwd-independent; AllMind uses it to inject MCP server tables for repo-scoped codex Mind turns
- Added `qwen` backend alias: `normalizeBackend()` rewrites `backend:'qwen'` → claude + `useLocalModel:true` at run()/openSession()/openHeadlessSession() entry; claude-tier model strings dropped (resolve to `DEFAULT_LOCAL_MODEL_NAME`), explicit local ids kept
- Added `opts.env` passthrough to codex spawn path (`sanitizeEnvCodex`): caller-supplied env merges last (caller wins); AllMind uses this for `ALLMIND_THREAD_ID` on codex dispatches
- Fixed Codex child window cascade: `detached: backend !== 'codex'` — node#21825 drops `windowsHide` when `detached: true` on win32
- Fixed Codex Phase 1 blockers: `resolveCodexNativeExecutable()` probes both `bin/codex.exe` (current) and `codex/codex.exe` (legacy); bumped `DEFAULT_CODEX_MODEL` to gpt-5.5
- Extended observability field assertions in integration tests; added real-subprocess timeout test via `CODEX_PATH=node.exe`

## 2026-06

### 2026-06-21 — Baked opts.env into interactive launcher; added thread_id to exit hook

- **Why:** `openSession()` interactive launcher only baked `ALLMIND_DISPATCH_ID` explicitly; any other env vars in `opts.env` (e.g. `ALLMIND_ORIGIN_THREAD_ID`, `ALLMIND_THREAD_ID`) were silently dropped, leaving those vars empty inside the spawned session. The exit hook POST body also lacked `thread_id`, so `/api/internal/event` couldn't route completion to the originating Mind thread unless the agent voluntarily called a report endpoint.
- **Impact:** All `opts.env` entries are now iterated and emitted as `$env:KEY = "value"` lines in the launcher PS1 using `escapePowerShellString`. Exit hook includes `"thread_id"` in the POST body details when the session was spawned with an origin thread.
- **Evidence:** 4d549df

### 2026-06-13 — Added opts.codexConfigOverrides for cwd-independent Codex config injection

- **Why:** Codex discovers config from `<cwd>/.codex/config.toml`; when AllMind dispatches a repo-scoped codex Mind turn with a different cwd, the MCP server table isn't picked up. Callers needed a spawn-time injection path independent of the cwd.
- **Impact:** `buildCodexArgs` (one-shot) and the interactive codex launcher now append each `opts.codexConfigOverrides` entry as a `codex --config <entry>` arg. One-shot passes entries as-is (`shell:false`, one argv each); interactive launcher wraps each in PowerShell-safe quotes.
- **Evidence:** d27d2239

### 2026-06-11 — Added 'qwen' backend alias for local-model spawns

- **Why:** AllMind's June-15 migration needs `config/backend-routing.json` to express a third backend value (local Qwen on Kevin's 5090) without teaching ~25 callsites the local-model flag mechanics. The runtime path (claude CLI + ANTHROPIC_BASE_URL override) was already proven; only the vocabulary was missing — AllMind's `resolveBackend()` coerced anything ≠ 'codex' to 'claude'.
- **Impact:** `normalizeBackend()` rewrites `backend:'qwen'` to `backend:'claude'` + `useLocalModel:true` at the entry of `run()`, `openSession()`, and `openHeadlessSession()`. Claude-tier model strings (opus/sonnet/haiku/claude-*) are dropped so spawns resolve to `DEFAULT_LOCAL_MODEL_NAME`; explicit local model ids pass through. Paired change in AllMind `lib/backend-routing.js` passes 'qwen' through.
- **Evidence:** ecfd7e6

### 2026-06-05 — Added opts.env passthrough to codex spawn path

- **Why:** AllMind's codex Mind dispatch path needed to inject `ALLMIND_THREAD_ID` into the spawned MCP child so dispatches attribute to the originating thread rather than inheriting the PM2 server env where the var is unset. Mirrors the existing `childEnv` wiring on the claude spawn path.
- **Impact:** `sanitizeEnvCodex` now accepts `opts.env`; any keys supplied by the caller are merged last (caller wins over base sanitized env). All codex spawn paths (`run()`, etc.) forward `opts.env`.
- **Evidence:** 22948d4

### 2026-06-05 — Fixed Codex child window cascade via hidden console

- **Symptom:** Every codex turn on Windows spawned a cascade of visible terminal windows (pwsh AST/shell helper, git.exe, conhost).
- **Root cause:** node#21825 silently drops `windowsHide: true` when `detached: true` on win32. A detached codex process gets a fresh VISIBLE console, and all its children (shell helpers, git, conhost) inherit that visible console.
- **Fix:** `detached: backend !== 'codex'` — codex spawns drop `detached: true` so `windowsHide: true` is honored and codex gets a hidden (CREATE_NO_WINDOW) console that its entire child tree rides silently. Claude keeps `detached: true` (its flashing is a separate ConPTY shim issue). `treeKill` is unaffected — it uses `taskkill /T /F` by PID, not the process group.
- **Prevention:** Never use `detached: true` for codex on win32. If adding a new backend that spawns child processes, test with `windowsHide: true` + `detached: true` and verify no visible windows appear.
- **Evidence:** 8cbaddc

### 2026-06-04 — Fixed Codex Phase 1 blockers: native exe dual-path probe + model default bump

- **Symptom:** All `backend: 'codex'` calls threw EINVAL; contract-validation report flagged two regressions in Phase 1.
- **Root cause:** (1) `resolveCodexNativeExecutable()` hardcoded the `vendor/<triple>/codex/codex.exe` path; newer Codex releases moved the binary to `vendor/<triple>/bin/codex.exe`, causing `null` resolution and fallback to the `.cmd` shim, which throws EINVAL under `shell: false`. (2) `DEFAULT_CODEX_MODEL` was `gpt-5.4` but Codex CLI 0.133.0 ships `gpt-5.5` as its default; the "requires newer version" comment was outdated.
- **Fix:** `resolveCodexNativeExecutable()` now probes both `bin/codex.exe` (current layout) and `codex/codex.exe` (legacy layout). `DEFAULT_CODEX_MODEL` bumped to `gpt-5.5`, confirmed working on 0.133.0.
- **Prevention:** When Codex CLI version is bumped, verify both the exe path layout and the default model name before deploying. Hazard entry in CONSTRAINTS updated.
- **Evidence:** 9be56fd

## 2026-05

### 2026-05-18 — Assert observability fields in integration tests; add real-subprocess timeout test

- **Why:** Observability fields (spawnMs, firstByteMs, promptBytes, concurrentAtStart, backend, model, role) were added in 64d469e but had no assertions verifying presence or correctness; timeout path had no test without mocking.
- **Impact:** Integration test for 'one-shot captures stdout' now asserts all observability fields (presence + non-NaN). New standalone 'run() timeout path' test uses `CODEX_PATH=node.exe` with a temp `.js` helper that writes one byte then sleeps; `run()` kills it after 2s and asserts `killedReason==='timeout'`, `timedOut===true`, `firstByteMs` null-or-number. No `MERCENARY_INTEGRATION` flag required for the timeout test. `.cmd` helpers avoided due to EINVAL under windowsHide+detached on Windows.
- **Evidence:** d4be6dc

### 2026-05-16 — Pin Codex default model to gpt-5.4 in buildCodexArgs

- **Why:** Codex CLI's built-in default (gpt-5.5 as of 2026-05-15) is rejected by the installed binary with "requires newer version of Codex". Every current AllMind caller passes `--model` explicitly, but a future caller omitting the flag would silently fail.
- **Impact:** `buildCodexArgs` now always passes `--model` with `gpt-5.4` as the fallback default. Callers that supply their own model are unaffected.
- **Evidence:** 1b43d8b

### 2026-05-08 — Allow local-model openSession on Windows with shell-free toolset

- **Why:** The Qg7 sandbox gate fires on shell tool invocations (not session init) when `ANTHROPIC_BASE_URL` points to a non-Anthropic endpoint. Throwing unconditionally blocked valid read/edit/refactor sessions.
- **Impact:** `openSession()` with `useLocalModel` on win32 now uses an `allowedTools` override (Read, Edit, Write, Glob, Grep) and injects an append-system-prompt notice telling the model shell tools are unavailable and to redispatch headless if needed. Shell-needing work still routes through `run()` / headless.
- **Evidence:** 6b21cfe

### 2026-05-08 — Fixed local-model OAuth mode; dropped ANTHROPIC_AUTH_TOKEN and ANTHROPIC_MODEL

- **Symptom:** Local-model Claude Code spawns were landing in API-billing mode or failing with the enterprise sandbox gate on Windows.
- **Root cause:** Three stacked bugs: (1) `ANTHROPIC_AUTH_TOKEN=not-needed` flipped Claude into API-billing mode; (2) `ANTHROPIC_MODEL` env was set to flag-side names — ignored for selection on 2.1.132 but triggered API-billing banner; (3) interactive `openSession()` launcher.ps1 never received env strips because `sanitizeEnv()` only ran for `run()` and `openHeadlessSession()`.
- **Fix:** `getLocalModelProfile()` drops `ANTHROPIC_AUTH_TOKEN` entirely. `sanitizeEnv()` strips `ANTHROPIC_MODEL` defensively. Both launcher.ps1 templates null `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_MODEL` and set `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` + `CLAUDE_CODE_REMOTE=1`. Model selection moved to `--model` flag. Added launcher debug dump for future diagnosis.
- **Prevention:** Never set `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_MODEL` env var on local-model spawns. Use `--model` flag for model selection.
- **Evidence:** 48d7135

### 2026-05-07 — Preserve CLAUDECODE and CLAUDE_CODE_ENTRYPOINT in local-model sanitizeEnv

- **Why:** Sandbox gate may key off these env vars to determine the policy hierarchy. Stripping them unconditionally changed the env shape relative to a normal interactive CC session.
- **Impact:** In the local-model branch of `sanitizeEnv()`, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` are preserved. Non-local-model paths continue to strip them as before.
- **Evidence:** 8f3b6b9

### 2026-05-07 — Inject --settings flag into local-model spawn paths

- **Why:** Native Windows sandbox gate fired during ALLMIND-launched local-model dispatches; a dedicated settings file with Bash-deny + PowerShell tool config was needed.
- **Impact:** `data/claude-local-model-settings.json` wired into `buildArgs()`, `openSession()`, and `openHeadlessSession()` when local-model mode is active via `--settings` flag. Added `--local-model-settings-path` CLI override. Test expectation updated to `127.0.0.1:8001` (current portproxy endpoint).
- **Evidence:** d765b8f

## 2026-04

### 2026-04-30 — Inject ALLMIND_LOCAL_MODEL=1 on local model spawns

- **Why:** Child processes (e.g. AllMind agents) needed a signal indicating the spawn is routing through the local LiteLLM proxy rather than the Anthropic API — `ANTHROPIC_BASE_URL` alone doesn't distinguish local proxy from other base URL overrides.
- **Impact:** When `useLocalModel` is set on any spawn path, `ALLMIND_LOCAL_MODEL=1` is injected into the child env alongside `ANTHROPIC_BASE_URL`. Unaffected on non-local spawns.
- **Evidence:** 022055d

### 2026-04-30 — Added local model profile and CLI flags

- **Why:** Callers needed a first-class way to invoke mercenary in local-model mode from the CLI without programmatic opts; also needed snake_case and camelCase alias parity with other flags.
- **Impact:** `--use-local-model` and `--local-model-url <url>` added to CLI entry point. Both snake_case and camelCase forms parsed. `useLocalModel` env profile applied to `run()`, `openSession()`, `openHeadlessSession()`. Tests added for profile and parser.
- **Evidence:** f9a6280

### 2026-04-28 — Fixed openSession() ENAMETOOLONG via PowerShell argv expansion

- **Symptom:** `openSession()` with large append prompts (~60K chars) failed with "filename or extension is too long" even though content was written to a temp file.
- **Root cause:** The launcher script loaded the temp file back with `Get-Content -Raw` into a PowerShell variable, then passed it inline as `--append-system-prompt $apContent`. PowerShell expands the variable into argv before invoking `claude.exe`, so the full content still hit the Windows `CreateProcess()` CLI length limit.
- **Fix:** Pass temp file paths directly via `--system-prompt-file`/`--append-system-prompt-file` flag variants — same pattern already used by `run()` and `openHeadlessSession()`.
- **Prevention:** Never load a temp file into a variable to pass inline; always use the `-file` flag variant when content lives in a file.
- **Evidence:** 92c46b3

### 2026-04-28 — Added useLocalModel option for local proxy routing

- **Why:** Callers (e.g. AllMind dispatch) needed to route specific spawns through a local LiteLLM proxy (→ Ollama) without affecting unrelated spawns.
- **Impact:** New `useLocalModel: true` option on `run()`, `openSession()`, and `openHeadlessSession()` injects `ANTHROPIC_BASE_URL=http://127.0.0.1:4000` into the child env. `localModelUrl` overrides the default URL. 5 lines added to `mercenary.js`.
- **Evidence:** 85c1f53

### 2026-04-17 — Fixed large appendSystemPrompt via temp file; fixed headless startup for Claude Code 2.1.88+

- **Why:** Two related issues: (1) headless spawns with large context (lookup tables + episodic context) were crashing on Windows with ENAMETOOLONG because the full prompt was passed as a CLI arg; (2) Claude Code 2.1.88+ requires stdin input within ~3s in stream-json pipe mode, causing silent hangs.
- **Impact:** `appendSystemPrompt` content >8K chars is written to a temp file; `--append-system-prompt-file <path>` is passed instead of inline `--append-system-prompt`. Headless session startup now sends stdin before the 3s window expires. 53 insertions, 13 deletions in `mercenary.js`.
- **Evidence:** fca0db9

## 2026-03

### 2026-03-21 — Added purpose and origin tracking to process ledger

- **Why:** Process ledger entries lacked context about what an agent was doing and who spawned it, making `--ps`/`--audit` output opaque for debugging and traceability.
- **Impact:** `purpose` (task description) and `origin` (spawner identity) added to ledger entries for all spawn modes: one-shot, interactive, headless, and Codex. Both fields display in `--ps`/`--audit` output. 27 lines changed in `mercenary.js`.
- **Evidence:** 6b79c79

### 2026-03-21 — Warn on spawn when purpose/origin not provided

- **Why:** Callers were omitting `purpose` and `origin` silently; without enforcement the ledger fields would be useless in practice.
- **Impact:** `run()`, `openSession()`, and `openHeadlessSession()` now log a stderr warning when either field is missing. No behavior change beyond the warning. 9 lines added to `mercenary.js`.
- **Evidence:** b70db11

### 2026-03-18 — Added launcher exit hook and dispatch_id env var for session tracking

- **Why:** AllMind needs to detect sessions that fail silently — if `mercenary_session_complete` never fires but `mercenary_session_exit` does, the session failed without reporting.
- **Impact:** When `dispatchId` is provided to `openSession()`, the generated launcher script sets `$env:ALLMIND_DISPATCH_ID` in the child environment and POSTs `mercenary_session_exit` to AllMind's `/api/internal/event` after Claude exits. 17 lines added to `mercenary.js`.
- **Evidence:** d5a82e6

### 2026-03-13 — Fixed --am persona path after AllMind repo relocation

- **Why:** AllMind repo moved persona file from `data/persona/` to `config/persona/`; `--am` / `role:'allmind'` was reading from the old path and failing silently.
- **Impact:** One-line path update in `mercenary.js`. No interface change.
- **Evidence:** b82123c

### 2026-03-12 — Added --session-id flag and fixed --resume CLI passthrough

- **Why:** `--resume` was programmatic-only (not in `valueFlags`); callers also needed a way to attach to a named session by UUID (`--session-id`) without resume semantics. Both share the same pattern: strip `--no-session-persistence`, pass the flag to claude CLI.
- **Impact:** `--session-id <uuid>` added to `buildArgs()` and `main()`. Both `--resume` and `--session-id` added to `parseArgs` `valueFlags` so they work correctly from the CLI. `sessionId` threaded through `main()` → `run()`.
- **Evidence:** 6d5b1b7

### 2026-03-11 — Added repo-agent role as pipeline alias

- **Why:** ALLMIND dispatch needed a named role for repo-scoped agent runs that shares pipeline semantics (streaming output, MCP isolation, workspace sandbox) without callers having to specify `role: 'pipeline'`.
- **Impact:** `repo-agent` role maps to identical behavior as `pipeline`: stream-json output, `--strict-mcp-config`, MCP disabled by default, `workspace-write` Codex sandbox. Two lines changed in `mercenary.js` role preset table.
- **Evidence:** 74e1cee

### 2026-03-08 — Codex role presets tightened; MCP and sandbox defaults added

- **Why:** Codex role presets claimed backend parity with Claude but applied incorrect defaults — pipeline needed sandbox isolation, allmind/coordinator needed MCP disabled to prevent popup storms.
- **Impact:** `shouldDisableCodexMcp(opts, mode)` and `getDefaultCodexSandbox(opts, mode)` now encode role-based defaults. Pipeline/streaming one-shot default to `workspace-write` sandbox + MCP disabled. Coordinator/allmind interactive default to MCP disabled. Explicit `opts.disableMcp`/`opts.sandbox` override all defaults.
- **Evidence:** 3dbda30

### 2026-03-07 — Codex backend resolves native .exe not .cmd shim on Windows

- **Why:** Spawning the `.cmd` shim for Codex on Windows causes extra shell processes, slower startup, and edge cases with stdin/stdout piping in `shell: false` mode. The native `.exe` is bundled in the Codex npm package.
- **Impact:** `resolveCodexNativeExecutable()` added. `resolveCodexPath()` first resolves to `codex.cmd`/shim via `resolveBinary()`, then attempts to find the vendored `.exe` alongside it. Falls back to shim if `.exe` not found. `collectCodexMcpServerNames()` added to parse Codex TOML configs for MCP server names.
- **Evidence:** 12a7fbd

### 2026-03-05 — Added openHeadlessSession() for persistent headless Claude sessions

- **Why:** Callers needed a way to run Claude persistently via pipe without opening a terminal window (distinct from `openSession()` which uses `wt`).
- **Impact:** New exported function `openHeadlessSession(opts)` — 238 lines added to `mercenary.js`. Uses stdin/stdout pipe, no terminal, supports long-lived sessions.
- **Evidence:** 6946b96

### 2026-03-05 — Added --resume support to run() / buildArgs()

- **Why:** Callers needed session continuity across `run()` invocations — resume a prior Claude session by ID.
- **Impact:** `run(opts)` now accepts `resume` option. When set, `--no-session-persistence` is omitted and `--resume <id>` is passed to claude CLI.
- **Evidence:** d30f19f

### 2026-03-06 — Stdin piping fallback for large CLI args

- **Why:** Windows caps command line length at ~32,767 chars. Core dispatch injecting registry, perception, working memory, and chinvex context can exceed this, causing silent truncation or spawn failures.
- **Impact:** `run()` now calls `estimateArgLength(spawnArgs)` before spawn. When length > `SAFE_CLI_CHARS` (20K), the positional prompt and `--` separator are removed from args, stdin is opened as `'pipe'`, and the prompt is written then closed. Short prompts use the original positional arg path unchanged. Codex backend unaffected.
- **Evidence:** 6136006

### 2026-03-05 — Reverted --system-prompt from buildArgs()

- **Why:** `--system-prompt` completely replaces the default system prompt, which is not what persona injection (Core) needs. `--append-system-prompt` via `appendSystemPrompt` already handles that correctly.
- **Impact:** `--system-prompt` removed from `buildArgs()`. Use `appendSystemPrompt` for persona injection; `--system-prompt` is only for cases requiring full default replacement.
- **Evidence:** 67c9b70

## 2026-02

### 2026-02-23 — Initial mercenary CLI + module implementation

- **Why:** AllMind and other callers needed a consistent, Windows-safe way to spawn Claude Code subprocesses with correct flags and env sanitization.
- **Impact:** Established the single-file pattern (`mercenary.js`), one-shot (`run()`) and interactive (`openSession()`) modes, process-tree kill via `taskkill`, env sanitization, and persona injection.
- **Evidence:** e83cb6d

### 2026-02-24 — Role-based presets, streaming callbacks, openSession options

- **Why:** Callers were manually composing flag sets; role presets let callers declare what they are, not which flags they need. Streaming callbacks needed for real-time log delivery to AllMind.
- **Impact:** Added `role` option to `run()` and `openSession()` with three presets. Added `onStart(pid)` and `onData(chunk, stream)` callbacks (backward-compatible). Extended `openSession()` with `cwd`, `allowedTools`, `model` options.
- **Evidence:** d7d7ccc

### 2026-02-24 — MCP suppression for pipeline/coordinator roles + mcpConfig option

- **Why:** Without MCP suppression, pipeline/coordinator Claude spawns triggered ~40 conhost popup windows on Windows from MCP server subprocesses.
- **Impact:** `pipeline` role now adds `--strict-mcp-config` + `--mcp-config mcp-none.json`. `coordinator` role defaults `strictMcp: true` in `openSession()`. New `mcpConfig` and `strictMcp` options allow explicit control outside role presets.
- **Evidence:** 72d3fd85

### 2026-02-24 — Fixed: SHELL override + remove invalid --no-session-persistence from openSession

- **Symptom:** `openSession()` crashes/misbehaves with `--no-session-persistence`; bash.exe inherited from PM2 environment.
- **Root cause:** `--no-session-persistence` is only valid for one-shot `-p` mode; was incorrectly passed to interactive session. PM2 sets `SHELL=bash.exe` in environment which gets inherited by child processes.
- **Fix:** Removed `--no-session-persistence` from `openSession()`. Added `SHELL=pwsh` override to both `sanitizeEnv()` and the `openSession()` launcher.
- **Prevention:** Rule: `--no-session-persistence` only for `-p` one-shot. Always force `SHELL=pwsh` when spawning.
- **Evidence:** e91fa35e

### 2026-02-24 — Fixed: --strict-mcp-config causes silent hang in interactive sessions

- **Symptom:** `openSession()` with coordinator role hangs silently — Claude starts but never responds.
- **Root cause:** `--strict-mcp-config` in interactive mode causes Claude to hang without error output.
- **Fix:** Disabled `--strict-mcp-config` for interactive sessions. Interactive sessions now default `strictMcp: false`; must be explicitly opted in.
- **Prevention:** Rule: Never use `--strict-mcp-config` in interactive (`openSession`) mode.
- **Evidence:** ea913040

### 2026-02-24 — Fixed: TEMP dir isolation per interactive session to prevent EINVAL

- **Symptom:** Multiple concurrent `openSession()` calls collide on task output directory, causing EINVAL errors.
- **Root cause:** All coordinator Claude processes shared the same TEMP/TMP, leading to file path collisions in Claude's task output dir.
- **Fix:** Each `openSession()` reuses its mkdtemp dir as child TEMP/TMP so each session gets an isolated scratch space.
- **Prevention:** Rule: Always set TEMP/TMP to the session's mkdtemp dir in `openSession()`.
- **Evidence:** 794fdfa3

### 2026-02-25 — Removed mcp-none.json fallback from pipeline role

- **Why:** Global `~/.claude.json` mcpServers is now empty by design. The `mcp-none.json` fallback was belt-and-suspenders for when global MCP servers existed; no longer needed.
- **Impact:** `pipeline` role uses `--strict-mcp-config` only. Removed `--mcp-config mcp-none.json` from `buildArgs()` and `openSession()`. Simplified code by ~20 lines.
- **Evidence:** 18c991f

### 2026-02-26 — SHELL switched from bash.exe to pwsh; stale Git Bash comments removed

- **Why:** The `SHELL=bash.exe` assignment and associated comments were added during a broken Claude Code update, not because pwsh was incompatible. The pwsh App Execution Alias as SHELL is correct and always was.
- **Impact:** Cleaned up ~12 lines of stale comments and incorrect SHELL assignment. `sanitizeEnv()` now sets `SHELL=pwsh` without caveats.
- **Evidence:** df43e22

### 2026-02-28 — Bootstrapped docs/memory/ tracking + chinvex session hook + Codex backend plan

- **Why:** Need persistent cross-session memory and a plan for the next major feature (Codex CLI backend support).
- **Impact:** Added `docs/memory/` (STATE, CONSTRAINTS, DECISIONS), `docs/plans/2026-02-27-codex-backend.md`, and `.claude/settings.json` with chinvex SessionStart hook. `.gitignore` updated to exclude runtime noise (`.chinvex-status.json`, `_patch.ps1`).
- **Evidence:** ac102d6
