# mercenary

Node.js CLI wrapper around Claude Code's `claude` command with proper subprocess management for Windows.

## Original Prompt

> Build a Node.js CLI tool called `mercenary` that wraps Claude Code's `claude` command with proper subprocess management for Windows.
>
> Two modes:
>
> ONE-SHOT (headless):
> - `mercenary --prompt `text` --timeout 30` -> runs `claude -p`, captures stdout, clean exit
> - `mercenary --prompt `text` --timeout 30 --allowed-tools `Bash,Read,Write`` -> flag pass-through
> - `mercenary --prompt `text` --json` -> returns `{ stdout, stderr, exitCode, timedOut, durationMs }`
>
> INTERACTIVE (visible terminal):
> - `mercenary --interactive --system-prompt context.txt` -> opens visible terminal, stays open
> - `mercenary --interactive --system-prompt context.txt `Begin observing.`` -> auto-start with initial message
>
> Subprocess management (both modes):
> - Spawned with `detached: true`, stdio piped (not inherited), `unref()` called
> - On timeout: kill entire process tree via `taskkill /T /F /PID` (not just parent), exit code 124
> - Stdout/stderr captured separately, no orphaned pipes on hang
> - PID tracking for external kill capability
> - Windows-specific: `shell: true` for cmd.exe compat, DETACHED_PROCESS flag to prevent handle inheritance
>
> Environment & flags (always applied):
> - `--dangerously-skip-permissions` always set (all launches are trusted/automated)
> - Unsets `CLAUDECODE` env var in child process (prevents nested session conflicts)
> - `CLAUDE_CODE_MAX_OUTPUT_TOKENS` defaults to 65536, overridable via `--max-tokens <n>`
> - `--am` flag: injects ALLMIND persona system prompt (calm, professional, robotic Armored Core 6 voice). Reads from a standard persona file location.
>
> Integration:
> - AllMind exposes two endpoints that wrap mercenary:
>   - `POST /api/mercenary/run` -> one-shot (prompt, timeout, allowedTools -> stdout or 504)
>   - `POST /api/mercenary/session` -> interactive (returns session ID for tracking)
> - AgentSpawner becomes a consumer of mercenary, not its own subprocess manager
> - Every Claude launch in the system (pipeline tasks, coordinator, summarize, dashboard) goes through mercenary
> - Pipeline agents call API endpoints, never spawn claude/codex directly
>
> Ship as single file with shim for P:\software\bin.

## Status

Project created 2026-02-23. Spec in progress.
