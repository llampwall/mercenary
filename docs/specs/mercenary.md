# mercenary

**Version:** v0.1.0
**Language/Runtime:** Node.js 22 (ESM, zero external dependencies)
**Created:** 2026-02-23

## Problem

AllMind has 4 different Claude subprocess patterns (`agent-spawner.js`, `chat-spawner.js`, `telegram-chat.js`, `pipeline-coordinator.js`) each with subtly different env sanitization, stdio config, timeout handling, and process tree cleanup. Bugs fixed in one don't propagate to others. Windows-specific issues (handle inheritance, zombie processes, nested session conflicts, .cmd shell escaping) are solved repeatedly. There is no single, tested primitive for "launch claude, get output, clean up."

## Solution

A single-file Node.js CLI + module (`mercenary`) that wraps all Claude Code subprocess spawning behind one consistent interface. Two modes: headless one-shot (captures output, enforces timeout, clean exit) and interactive (visible Windows Terminal session). Ships as a standalone strap-managed repo with a shim at `P:\software\bin\mercenary.cmd`, importable as a JS module by AllMind.

## Technical Approach

### Architecture

Single file: `mercenary.js` (~400-600 lines). No build step, no dependencies beyond Node.js stdlib (`child_process`, `fs`, `path`, `os`).

**Exports (JS module API):**
- `run(opts)` -- headless one-shot, returns `Promise<RunResult>`
- `openSession(opts)` -- interactive visible terminal, returns `Promise<SessionResult>`
- `treeKill(pid)` -- kill entire process tree (Windows `taskkill /T /F`)
- `resolveClaudePath()` -- find the claude binary (for diagnostics)

**CLI (wraps the module):**
```
mercenary --prompt <text> [--timeout <s>] [--json] [--allowed-tools <list>]
    [--max-tokens <n>] [--am | --persona <path>] [--model <name>]
    [--output-format <fmt>] [--append-system-prompt <text>] [--max-turns <n>]
    [--cwd <dir>]

mercenary --interactive [--system-prompt <path>] [--am | --persona <path>]
    [--title <title>] [<initial-message>]

mercenary --kill <pid>
```

### Binary Resolution

Mercenary resolves the `claude` executable at startup to avoid `shell: true`:

1. `CLAUDE_PATH` env var (explicit override)
2. `C:\Users\Jordan\.local\bin\claude.exe` (known install location)
3. `which claude` / PATH lookup as fallback

If resolution fails, exit with clear error: "claude binary not found. Set CLAUDE_PATH or ensure claude is installed."

### Subprocess Management

#### One-shot mode (`run()`)

```js
const proc = spawn(claudePath, ['-p', ...buildArgs(opts)], {
  cwd: opts.cwd || process.cwd(),
  shell: false,
  windowsHide: true,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: sanitizeEnv(opts)
});
proc.unref();
```

- stdout/stderr accumulated in separate buffers
- On process `close`: resolve with `{ stdout, stderr, exitCode, timedOut: false, durationMs, pid }`
- On timeout: call `treeKill(pid)`, resolve with `{ ..., timedOut: true, exitCode: 124 }`
- If process hangs after kill (grace period 5s): force kill again, log warning

#### Interactive mode (`openSession()`)

1. Write system prompt + args to temp launcher script:
   ```
   $env:CLAUDECODE = $null
   $env:CLAUDE_CODE_ENTRYPOINT = $null
   $env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = "65536"
   & "C:\Users\Jordan\.local\bin\claude.exe" --dangerously-skip-permissions `
     --system-prompt (Get-Content "<temp-prompt-file>" -Raw) `
     "Begin observing."
   ```
2. Spawn Windows Terminal:
   ```js
   spawn('wt', ['-w', '0', 'nt', '--title', title, 'pwsh', '-NoProfile', '-NoExit', '-File', launcherPath], {
     detached: true,
     stdio: 'ignore',
     shell: false,
     windowsHide: false
   });
   proc.unref();
   ```
3. Return `{ pid, title, launcherPath }` immediately. Session is now autonomous.

#### Environment Sanitization (`sanitizeEnv()`)

Always applied to child process env:

| Variable | Action | Reason |
|---|---|---|
| `CLAUDECODE` | Delete | Prevents "cannot launch inside another session" |
| `CLAUDE_CODE_ENTRYPOINT` | Delete | Same nested session guard |
| `ANTHROPIC_API_KEY` | Delete | Forces OAuth, prevents stale key auth failures |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Set to 65536 (or `--max-tokens` value) | Default output cap |

### Persona System

- `--persona <path>` reads the file at `<path>`, wraps content in `<persona>...</persona>` XML tags, passes via `--append-system-prompt`
- `--am` is sugar for `--persona P:\software\allmind\config\persona\allmind-voice.md`
- If both `--persona` and `--append-system-prompt` are provided, persona comes first (concatenated)
- File read is synchronous and uncached (mercenary is short-lived per CLI invocation; AllMind module consumers can cache at their layer)

### Flag Pass-through

These claude flags are forwarded when provided:

| mercenary flag | claude flag | Notes |
|---|---|---|
| `--allowed-tools <list>` | `--allowed-tools <list>` | Comma-separated tool names |
| `--model <name>` | `--model <name>` | e.g. `claude-sonnet-4-6` |
| `--output-format <fmt>` | `--output-format <fmt>` | `text`, `json`, `stream-json` |
| `--append-system-prompt <text>` | `--append-system-prompt <text>` | Additional system context |
| `--max-turns <n>` | `--max-turns <n>` | Limit agentic turns |
| `--cwd <dir>` | spawn `cwd` option | Working directory for claude |

Always injected (not optional, not configurable):
- `--dangerously-skip-permissions`
- `--no-session-persistence`

### Tree Kill

```js
function treeKill(pid) {
  try {
    execSync(`taskkill /T /F /PID ${pid}`, { windowsHide: true, stdio: 'ignore' });
  } catch {
    // Process already dead -- ignore
  }
}
```

Kills the entire Windows process tree rooted at `pid`. Used for timeout enforcement and external kill requests.

### CLI Argument Parser

Built-in, no dependency. Parses `process.argv` manually:
- `--flag value` pairs stored in options object
- `--json` boolean flag
- `--am` boolean flag
- `--interactive` boolean flag
- Positional args after all flags = initial message (interactive mode)
- Unknown flags: warn and ignore (don't break forward compat)

### File Layout

```
P:\software\mercenary\
  mercenary.js          # Single file: module exports + CLI entry point
  package.json          # type: module, bin: { mercenary: ./mercenary.js }
  README.md
  CLAUDE.md
  docs/specs/mercenary.md
  test/
    mercenary.test.js   # Spawn/kill/timeout/env tests
```

### Integration with AllMind

AllMind adds two routes (in a new `routes/mercenary.js`):

**POST /api/mercenary/run**
```json
Request:  { "prompt": "...", "timeout": 30, "allowedTools": ["Bash","Read"],
            "maxTokens": 65536, "persona": "path", "model": "...",
            "outputFormat": "text", "cwd": "..." }
Response: { "stdout": "...", "stderr": "...", "exitCode": 0,
            "timedOut": false, "durationMs": 4523 }
Error:    504 if timeout exceeded (timedOut: true still in body)
```

**POST /api/mercenary/session**
```json
Request:  { "systemPrompt": "...", "initialMessage": "Begin.",
            "persona": "path", "title": "Pipeline Observer" }
Response: { "pid": 12345, "title": "Pipeline Observer" }
```

AllMind imports mercenary:
```js
import { run, openSession, treeKill } from 'P:\\software\\mercenary\\mercenary.js';
```

Over time, AgentSpawner, chat-spawner, telegram-chat, and pipeline-coordinator are refactored to use mercenary as their spawn primitive. This migration happens in allmind, not in mercenary's v1.

## Interaction Flows

### Flow 1: One-shot headless (CLI)
1. User runs `mercenary --prompt "Summarize this file" --timeout 30`
2. Mercenary resolves claude binary path, sanitizes env, builds args
3. Spawns `claude -p --dangerously-skip-permissions --no-session-persistence` with piped stdio
4. stdout accumulates in buffer; stderr captured separately
5. Claude exits within timeout -> mercenary prints stdout, exits with claude's exit code

### Flow 2: One-shot timeout (CLI)
1. User runs `mercenary --prompt "Long task" --timeout 5`
2. Spawn as above, timer starts
3. 5 seconds elapse, claude still running
4. Mercenary calls `taskkill /T /F /PID <pid>`, waits 5s grace period
5. Prints captured stdout so far (if any), exits with code 124

### Flow 3: One-shot JSON output (CLI)
1. User runs `mercenary --prompt "Fix bug" --json --timeout 60`
2. Spawn and capture as Flow 1
3. On completion: prints `{"stdout":"...","stderr":"...","exitCode":0,"timedOut":false,"durationMs":4523}` to stdout
4. Exit code is always 0 when `--json` (result is in the JSON)

### Flow 4: One-shot with tool restrictions (CLI)
1. User runs `mercenary --prompt "Read and fix" --allowed-tools "Bash,Read,Write" --timeout 120`
2. Mercenary passes `--allowed-tools Bash,Read,Write` through to claude args
3. Rest identical to Flow 1

### Flow 5: Interactive session (CLI)
1. User runs `mercenary --interactive --system-prompt context.txt`
2. Mercenary writes launcher .ps1 to temp dir, reads system-prompt file
3. Spawns `wt nt --title "Mercenary" pwsh -NoProfile -NoExit -File launcher.ps1`
4. Terminal window appears with live claude session
5. Mercenary prints PID to stdout and exits immediately

### Flow 6: Interactive with initial message (CLI)
1. User runs `mercenary --interactive --system-prompt context.txt "Begin observing."`
2. Same launcher generation as Flow 5
3. Launcher invokes: `claude --dangerously-skip-permissions --system-prompt <contents> "Begin observing."`
4. Claude starts and immediately processes "Begin observing." as first turn
5. Session remains interactive in the visible terminal

### Flow 7: Persona injection (CLI)
1. User runs `mercenary --prompt "Status report" --am --timeout 30`
2. Mercenary reads `P:\software\allmind\config\persona\allmind-voice.md`
3. Wraps content in `<persona>...</persona>` tags
4. Passes via `--append-system-prompt` to claude
5. Rest identical to Flow 1

### Flow 8: Programmatic one-shot (JS API)
1. AllMind calls `const result = await run({ prompt: "...", timeout: 30000, allowedTools: ["Bash"] })`
2. Mercenary spawns, captures, returns `{ stdout, stderr, exitCode, timedOut, durationMs, pid }`
3. AllMind sends HTTP response to client

### Flow 9: Programmatic session (JS API)
1. AllMind calls `const session = await openSession({ systemPrompt: "...", initialMessage: "Begin." })`
2. Mercenary spawns visible terminal, returns `{ pid, title, launcherPath }`
3. AllMind returns session tracking info

### Flow 10: External kill
1. Process manager knows PID from earlier launch
2. Calls `treeKill(pid)` (JS) or `mercenary --kill <pid>` (CLI)
3. `taskkill /T /F` kills entire process tree
4. Silent success (already-dead processes don't error)

## Acceptance Criteria

- [ ] `mercenary --prompt "echo hello" --timeout 10` captures claude's stdout and exits cleanly
- [ ] `mercenary --prompt "echo hello" --json` returns valid JSON with stdout, stderr, exitCode, timedOut, durationMs fields
- [ ] `mercenary --prompt "slow task" --timeout 2` kills the process tree after 2s and exits with code 124
- [ ] Child process env does NOT contain `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, or `ANTHROPIC_API_KEY`
- [ ] Child process env contains `CLAUDE_CODE_MAX_OUTPUT_TOKENS=65536` by default
- [ ] `--max-tokens 8192` overrides `CLAUDE_CODE_MAX_OUTPUT_TOKENS` to 8192
- [ ] `--allowed-tools "Bash,Read"` is passed through to claude as `--allowed-tools Bash,Read`
- [ ] `--am` reads persona file, wraps in `<persona>` tags, passes as `--append-system-prompt`
- [ ] `--persona /path/to/file.md` reads arbitrary persona file
- [ ] `--interactive` spawns a visible Windows Terminal tab and exits immediately
- [ ] `--interactive "Begin."` seeds the first turn without breaking interactivity
- [ ] `--kill <pid>` terminates the process tree silently
- [ ] `import { run, openSession, treeKill } from './mercenary.js'` works as ES module
- [ ] `run()` rejects with clear error if claude binary not found
- [ ] No external npm dependencies (only Node.js stdlib)
- [ ] Strap shim at `P:\software\bin\mercenary.cmd` launches `node mercenary.js`

## Constraints

- Windows only (uses `taskkill`, `wt`, `pwsh`, Windows-specific spawn flags)
- Assumes `claude` is installed at `C:\Users\Jordan\.local\bin\claude.exe` (overridable via `CLAUDE_PATH`)
- Assumes Windows Terminal (`wt`) is installed (for interactive mode)
- `--dangerously-skip-permissions` always set -- all launches are trusted/automated
- ALLMIND persona path hardcoded: `P:\software\allmind\config\persona\allmind-voice.md`
- AllMind API integration (routes) is AllMind-side work, not part of mercenary v1
- Node.js 22+ required (uses ESM, modern APIs)

## Out of Scope (v1)

- Codex support (different spawn protocol, deferred)
- Agent config template resolution (stays in AllMind's AgentSpawner)
- Watchdog/memory monitoring (stays in AgentSpawner -- mercenary is the spawn primitive)
- HTTP server in mercenary itself (AllMind provides the API layer)
- Process state persistence / crash recovery (AllMind handles this)
- Hot-reloading persona files (consumers cache at their layer)
- Cross-platform support (Linux/macOS)
- Streaming output (v1 buffers full output; streaming is a v2 concern)

## Notes

- The existing `TOOL_RESTRICT_FLAG` detection pattern in `agent-spawner.js` (probing `claude --help` for `--allowedTools` vs `--allowed-tools`) should be preserved. Mercenary can detect this once at import time and cache the result.
- When AllMind migrates to mercenary, the `spawner-instance.js` singleton pattern can stay -- it just calls `mercenary.run()` internally instead of raw `spawn()`.
- The `chat-spawner.js` HTTP server (port 7781) can eventually be deprecated once mercenary + AllMind API routes cover the same surface area.
- TODO: Decide whether `--output-format stream-json` should stream incrementally to the caller or buffer. Buffering is simpler for v1 but loses real-time progress.
