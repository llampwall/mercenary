<!-- DO: Append new entries to current month. Rewrite Recent rollup. -->
<!-- DON'T: Edit or delete old entries. Don't log trivial changes. -->

# Decisions

## Recent (last 30 days)
- Fixed ENAMETOOLONG on Windows: `appendSystemPrompt` content >8K chars now writes to temp file, uses `--append-system-prompt-file`
- Fixed headless session startup hang on Claude Code 2.1.88+: stream-json pipe mode now sends stdin within the 3s window
- Added concept-to-files lookup table at `docs/sys/lookup.json` for faster codebase navigation

## 2026-04

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
