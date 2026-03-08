# mercenary

Windows subprocess manager for AI coding agents. It wraps the `claude` (Claude Code) and `codex` (OpenAI Codex CLI) binaries with shared lifecycle handling on Windows: binary resolution, environment sanitization, timeout enforcement, process-tree cleanup, and Windows Terminal launchers.

Mercenary is not a backend-neutral abstraction layer. It exposes one API surface, but the Claude and Codex backends have different native capabilities, different config models, and different Windows behavior. Backend-specific behavior is explicit in this README and in the code.

Single file (`mercenary.js`), zero dependencies, Node.js 22 ESM.

---

## Requirements

- **Node.js 22+**
- **Windows** (uses `taskkill`, `wt`, `pwsh` — not portable)
- **Claude backend:** `claude` CLI installed — `npm install -g @anthropic-ai/claude-code`
- **Codex backend:** `codex` CLI installed — `npm install -g @openai/codex` _(optional)_
- **Interactive mode:** Windows Terminal (`wt`) on PATH

---

## Design Reality

Mercenary shares process-management plumbing across backends, but it does not make Claude and Codex interchangeable.

- Shared across backends: process spawning, timeout kill, PID tracking, env cleanup, working-directory control, interactive Windows Terminal launch, and result shape.
- Claude-specific: tool allowlists, max turns, max output tokens, output-format handling, strict MCP config, system-prompt file loading, and most role presets.
- Codex-specific: `codex exec`, `developer_instructions` via `--config`, sandbox/approval policy mapping, optional per-run MCP disable overrides, and Codex-native AGENTS/config behavior.

If you are choosing a backend, treat Mercenary as a common Windows launcher plus backend adapters, not as a promise of feature parity.

---

## CLI Usage

### One-shot (headless)

Runs the agent, captures output, exits cleanly.

```powershell
node mercenary.js --prompt "summarize this file" --timeout 30
node mercenary.js --prompt "fix the bug" --timeout 60 --json
node mercenary.js --prompt "run the tests" --backend codex --timeout 30
```

### Interactive (visible terminal)

Opens a new Windows Terminal tab with the agent running interactively.

```powershell
node mercenary.js --interactive
node mercenary.js --interactive --system-prompt context.txt
node mercenary.js --interactive --backend codex
node mercenary.js --interactive "Begin reviewing the PR"
```

### Kill a process tree

```powershell
node mercenary.js --kill 12345
```

---

## CLI Flags

| Flag | Type | Description |
|---|---|---|
| `--prompt <text>` | string | Run one-shot with this prompt _(required for one-shot mode)_ |
| `--interactive` | boolean | Open an interactive terminal session |
| `--backend <name>` | string | `claude` (default) or `codex` |
| `--timeout <s>` | number | Kill after N seconds; exit code 124 on timeout |
| `--json` | boolean | Print result as JSON to stdout and always exit 0 |
| `--model <id>` | string | Override model (e.g. `claude-opus-4-5`, `gpt-4o`) |
| `--allowed-tools <list>` | string | Comma-separated tool allowlist — _claude only_ |
| `--max-turns <n>` | number | Limit agentic turns — _claude only_ |
| `--max-tokens <n>` | number | Set `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (default 65536) — _claude only_ |
| `--output-format <fmt>` | string | `text`, `json`, `stream-json` — _claude only_ |
| `--append-system-prompt <text>` | string | Append text to system prompt |
| `--system-prompt <path>` | string | Load system prompt from file — _interactive mode only_ |
| `--persona <path>` | string | Load persona from file and inject into system prompt — _claude only_ |
| `--am` | boolean | Use AllMind persona (`allmind-voice.md`) — _claude only_ |
| `--title <text>` | string | Window title for interactive mode |
| `--cwd <path>` | string | Working directory for the agent process |
| `--kill <pid>` | number | Kill a process tree by PID |
| `--ps` | boolean | Show all tracked processes with status and memory |
| `--audit` | boolean | Scan system-wide, discover orphan processes, update ledger |
| `--purge` | boolean | Kill all tracked processes, monitor 3 min, confirm death |

Positional arguments after flags are passed as the `initialMessage` in interactive mode.

---

## Backends

### `claude` (default)

Wraps the [Claude Code](https://github.com/anthropics/claude-code) CLI.

- **One-shot:** `claude -p <prompt> [flags]`
- **Interactive:** opens `claude` in a Windows Terminal tab via a generated PowerShell launcher
- This is the more feature-complete backend in Mercenary today

### `codex`

Wraps the [OpenAI Codex CLI](https://github.com/openai/codex).

- **One-shot:** `codex exec [mapped flags] <prompt>`
- **Interactive:** opens `codex` in a Windows Terminal tab
- Install: `npm install -g @openai/codex`
- Set `CODEX_API_KEY` or `OPENAI_API_KEY` in your environment for authentication
- Mercenary uses a subset mapping here, not a Claude-compatible mirror
- On Windows, Mercenary prefers the native vendored `codex.exe` under the npm install over the `.cmd` shim

**Feature availability on the codex backend:**

| Feature | codex | Notes |
|---|---|---|
| `--prompt` | ✅ | Passed as positional arg to `codex exec` |
| `--timeout` | ✅ | Enforced by mercenary (taskkill), exit code 124 |
| `--model` | ✅ | Maps to `codex exec --model` |
| `--interactive` | ✅ | Opens `codex` in Windows Terminal |
| `--cwd` | ✅ | Sets working directory |
| `--append-system-prompt` | ✅ | Maps to `--config developer_instructions=<text>` |
| `--persona <path>` | ✅ | File is read and passed as `developer_instructions` (no XML wrapper) |
| `--am` | ✅ | Reads AllMind persona file and passes as `developer_instructions` |
| `--json` / JSONL output | ✅ via `role: 'pipeline'` | Maps to `codex exec --json` |
| `opts.sandbox` | ✅ | `--sandbox read-only\|workspace-write\|danger-full-access` + `--config approval_policy="never"`; `role: 'pipeline'` defaults this to `workspace-write` |
| `disableMcp` | ✅ | Adds per-server `enabled=false` overrides for MCP servers discovered in `~/.codex/config.toml` and `<cwd>/.codex/config.toml`; enabled by default for Codex `pipeline`, `allmind`, and interactive `coordinator` |
| MCP servers | ✅ (Codex-native config) | Codex loads MCP servers from `~/.codex/config.toml` and `.codex/config.toml`; Mercenary can only disable discovered servers per run, not replace Codex's MCP system |
| `--allowed-tools` | ❌ | No direct equivalent; use `opts.sandbox` to restrict filesystem access |
| `--max-turns` | ❌ | No codex equivalent — warning printed, ignored |
| `--max-tokens` | ❌ | No codex equivalent |
| `--output-format` | ❌ | Controlled by role only (`--json` for pipeline, plain text otherwise) |
| `--system-prompt <path>` | ❌ | Claude interactive only; use `--persona` or `--append-system-prompt` instead |
| `--strict-mcp-config` / `mcpConfig` | ❌ | Not applicable; codex manages MCP via its own config system |

**MCP on codex:** Codex uses `~/.codex/config.toml` and `.codex/config.toml` for MCP server definitions. Mercenary does not own that system. The only Codex-side MCP control Mercenary currently provides is `disableMcp: true`, which discovers configured server names and injects per-run `mcp_servers.<name>.enabled=false` overrides. It does not provide Claude-style `mcpConfig` or `strictMcp` semantics for Codex.

**AGENTS.md:** Codex reads `AGENTS.md` files as a persistent instruction layer before each task. Place project-specific instructions in `<project>/.codex/AGENTS.md` or global defaults in `~/.codex/AGENTS.md`. This is separate from `developer_instructions` (which mercenary injects via `--persona` / `--append-system-prompt`) and stacks on top of it.

---

## Module API

```js
import { run, openSession, treeKill, resolveClaudePath, resolveCodexPath } from './mercenary.js';
```

### `run(opts)` → `Promise<Result>`

Runs an agent one-shot and returns captured output.

```js
const result = await run({
  prompt: 'Reply with: OK',      // required
  backend: 'claude',             // 'claude' | 'codex' — default 'claude'
  timeout: 30,                   // seconds before kill; omit for no timeout
  model: 'claude-opus-4-6',      // optional model override
  role: 'pipeline',              // see Roles below
  allowedTools: 'Bash,Read',     // claude only
  maxTurns: 5,                   // claude only
  maxTokens: 32768,              // claude only
  outputFormat: 'stream-json',   // claude only
  verbose: true,                 // claude only, with outputFormat
  appendSystemPrompt: 'Be brief',
  persona: 'C:/path/persona.md', // claude: --append-system-prompt with XML wrap; codex: developer_instructions
  sandbox: 'workspace-write',    // codex only: read-only | workspace-write | danger-full-access; pipeline defaults to workspace-write
  disableMcp: true,              // codex only: disable MCP servers discovered from ~/.codex/config.toml and .codex/config.toml; default for pipeline/allmind
  mcpConfig: 'C:/path/mcp.json', // claude only
  strictMcp: true,               // claude only
  cwd: 'C:/project',
  onStart: (pid) => { /* called synchronously with PID */ },
  onData: (chunk, stream) => { /* 'stdout' | 'stderr' */ },
});
```

**Result object:**

```js
{
  stdout: string,      // captured stdout, trailing whitespace trimmed
  stderr: string,      // captured stderr, trailing whitespace trimmed
  exitCode: number,    // process exit code; 124 if timed out
  timedOut: boolean,
  durationMs: number,
  pid: number,
}
```

### `openSession(opts)` → `Promise<{ pid, title, launcherPath }>`

Opens an interactive agent session in a new Windows Terminal tab.

```js
const session = await openSession({
  backend: 'claude',             // 'claude' | 'codex' — default 'claude'
  title: 'My Agent',
  cwd: 'C:/project',
  initialMessage: 'Begin.',      // optional opening message
  model: 'claude-sonnet-4-6',
  role: 'coordinator',           // see Roles below
  systemPrompt: 'You are...',    // claude only; string (not path)
  appendSystemPrompt: '...',     // claude only
  persona: 'C:/path/persona.md', // claude only
  allowedTools: 'Bash,Read',     // claude only (overrides role default)
  strictMcp: false,              // claude only; default false — do NOT set true for interactive
  mcpConfig: 'C:/path/mcp.json', // claude only
  maxTokens: 65536,              // claude only
});
// session.pid  — PID of the Windows Terminal process
// session.launcherPath — path to the generated .ps1 launcher script
```

### `treeKill(pid)`

Kills a process and all its descendants using `taskkill /T /F /PID`. Silent if the process is already dead.

```js
treeKill(result.pid);
```

### `resolveClaudePath()` → `string`

Returns the path to the `claude` binary. Checks `CLAUDE_PATH` env var first, then a known install location, then `where.exe claude`. Throws if not found.

### `resolveCodexPath()` → `string`

Returns the path to the `codex` binary. Checks `CODEX_PATH` env var first, then `where.exe codex`. Throws if not found.

---

## Roles

Roles are presets, not a cross-backend contract. The same role name can map to materially different behavior on Claude vs Codex.

| Role | Mode | claude behavior | codex behavior |
|---|---|---|---|
| `'pipeline'` | one-shot | `--output-format stream-json --verbose --strict-mcp-config` | `--json`, `sandbox=workspace-write` by default, plus default per-run MCP disable overrides for discovered Codex MCP servers |
| `'allmind'` | one-shot | `--output-format text` + AllMind persona injection | AllMind persona as `developer_instructions` + `--config personality=pragmatic`, with MCP disabled by default |
| `'coordinator'` | interactive | `allowedTools` defaults to `Bash,Read,Edit,Write,Glob,Grep` | `sandbox` defaults to `workspace-write`; Codex default `approval_policy` (`on-request`) provides the supervised interaction pattern, with MCP disabled by default |

The `streaming: true` option is a legacy alias for `role: 'pipeline'`.

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `CLAUDE_PATH` | mercenary | Override path to `claude` binary |
| `CODEX_PATH` | mercenary | Override path to `codex` binary |
| `CODEX_API_KEY` | codex | API key for non-interactive codex runs |
| `OPENAI_API_KEY` | codex | Alternative API key (used during `codex login`) |
| `MERCENARY_INTEGRATION` | test suite | Set to `1` to run integration tests |

**Variables stripped from child env (both backends):**

- `CLAUDECODE` — prevents nested session detection
- `CLAUDE_CODE_ENTRYPOINT` — prevents environment pollution
- `ANTHROPIC_API_KEY` — child must not inherit parent credentials

**Variables set in child env:**

- `SHELL` — forced to `pwsh.exe` (prevents inherited `bash.exe` from Windows automation hosts)
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS` — set to `opts.maxTokens` or `65536` _(claude only)_

---

## Process Management

- Spawned with `shell: false`, resolved binary path (no PATH lookup at spawn time)
- `windowsHide: true`, `detached: true`, `stdio: ['ignore', 'pipe', 'pipe']`
- `proc.unref()` — parent exit does not wait for child
- Timeout kill: `taskkill /T /F /PID` kills the entire process tree, not just the root process
- Double-kill: a second `taskkill` fires after 5s grace period to handle stubborn processes
- Exit code `124` on timeout (matches `timeout(1)` convention)

**Note on Windows console window flashing:** `windowsHide: true` only applies to the top-level Mercenary child. Descendant processes spawned by the backend may still create visible windows on Windows.

- Claude: child tool or MCP processes can still flash visible console windows. The `pipeline` role mitigates the MCP-server portion by suppressing MCP loading via `--strict-mcp-config`.
- Codex: even with `disableMcp: true`, Codex may still spawn visible `pwsh`, `git`, or `conhost` children during tool execution on Windows. That is backend behavior, not something Mercenary fully suppresses.

---

## Running Tests

```powershell
node test/mercenary.test.js
```

Integration tests (require live `claude` binary and API access):

```powershell
$env:MERCENARY_INTEGRATION = "1"; node test/mercenary.test.js
```
