<!-- DO: Append new entries to current month. Rewrite Recent rollup. -->
<!-- DON'T: Edit or delete old entries. Don't log trivial changes. -->

# Decisions

## Recent (last 30 days)
- Added `openHeadlessSession()` for persistent headless Claude sessions via stdin/stdout pipe (no terminal window)
- Added `--resume <id>` support in `run()` for session continuity across calls; strips `--no-session-persistence` when resuming
- Reverted `--system-prompt` addition from `buildArgs()`; `--append-system-prompt` (appendSystemPrompt) is the correct persona injection mechanism
- Bootstrapped `docs/memory/` tracking system and chinvex SessionStart hook via `.claude/settings.json`
- Added Codex backend plan (`docs/plans/2026-02-27-codex-backend.md`) for routing calls through `codex exec`
- SHELL forced to `pwsh` (App Execution Alias); MCP suppression via `--strict-mcp-config` only; TEMP/TMP isolated per session

## 2026-03

### 2026-03-05 — Added openHeadlessSession() for persistent headless Claude sessions

- **Why:** Callers needed a way to run Claude persistently via pipe without opening a terminal window (distinct from `openSession()` which uses `wt`).
- **Impact:** New exported function `openHeadlessSession(opts)` — 238 lines added to `mercenary.js`. Uses stdin/stdout pipe, no terminal, supports long-lived sessions.
- **Evidence:** 6946b96

### 2026-03-05 — Added --resume support to run() / buildArgs()

- **Why:** Callers needed session continuity across `run()` invocations — resume a prior Claude session by ID.
- **Impact:** `run(opts)` now accepts `resume` option. When set, `--no-session-persistence` is omitted and `--resume <id>` is passed to claude CLI.
- **Evidence:** d30f19f

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
