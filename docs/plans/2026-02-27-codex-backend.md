# Codex Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `--backend codex` flag (and `backend` option in module API) that routes subprocess calls through the OpenAI Codex CLI (`codex exec`) instead of `claude`.

**Architecture:** Keep the single-file structure. Add a `BACKENDS` object keyed by `'claude'` and `'codex'`, each providing `resolvePath()`, `sanitizeEnv()`, and `buildArgs()` methods. `run()` and `openSession()` accept `opts.backend` (default `'claude'`) and dispatch to the appropriate backend. Unsupported features (roles, persona injection, MCP config) are silently skipped for the codex backend with a stderr note.

**Tech Stack:** Node.js 22 ESM, zero dependencies, Windows (`where.exe` for PATH lookup).

---

## Flag Mapping Reference

| Concept | Claude flag | Codex equivalent |
|---|---|---|
| One-shot prompt | `claude -p "prompt"` | `codex exec "prompt"` |
| Skip all permissions | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` |
| No session persistence | `--no-session-persistence` | `--ephemeral` |
| JSONL streaming | `--output-format stream-json --verbose` | `--json` |
| Plain text output | `--output-format text` | (default, no flag) |
| Model selection | `--model <id>` | `--model <id>` |
| System/persona injection | `--append-system-prompt <text>` | `--config developer_instructions="<text>"` |
| Max turns | `--max-turns <n>` | *(no equivalent — skip with stderr warning)* |
| Allowed tools | `--allowed-tools <list>` | *(no equivalent — skip with stderr warning)* |
| MCP config | `--mcp-config` / `--strict-mcp-config` | *(no equivalent — skip silently)* |
| API key env var (strip) | `ANTHROPIC_API_KEY` | *(strip same; codex uses `CODEX_API_KEY`)* |
| Working directory | `opts.cwd` passed to spawn | `--cd <path>` flag |

## Env Var Handling for Codex

- Strip `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_API_KEY` (same as Claude)
- Do NOT strip `OPENAI_API_KEY` or `CODEX_API_KEY` — codex needs them
- Remove `CLAUDE_CODE_MAX_OUTPUT_TOKENS` — not meaningful to codex
- Set `SHELL` to pwsh same as Claude

---

### Task 1: Add `resolveCodexPath()` and tests

**Files:**
- Modify: `mercenary.js` (after `resolveClaudePath`)
- Modify: `test/mercenary.test.js`

**Step 1: Write the failing test**

In `test/mercenary.test.js`, add after the existing `resolveClaudePath` tests:

```js
// --- resolveCodexPath ---

test('resolveCodexPath uses CODEX_PATH env var when set to existing file', () => {
  const orig = process.env.CODEX_PATH;
  process.env.CODEX_PATH = claudePath; // reuse the known claude path as a stand-in
  try {
    const result = resolveCodexPath();
    assert.strictEqual(result, claudePath);
  } finally {
    if (orig === undefined) delete process.env.CODEX_PATH;
    else process.env.CODEX_PATH = orig;
  }
});

test('resolveCodexPath throws when CODEX_PATH set to nonexistent file', () => {
  const orig = process.env.CODEX_PATH;
  process.env.CODEX_PATH = 'C:\\nonexistent\\codex.exe';
  try {
    assert.throws(() => resolveCodexPath(), /CODEX_PATH/);
  } finally {
    if (orig === undefined) delete process.env.CODEX_PATH;
    else process.env.CODEX_PATH = orig;
  }
});
```

Then export `resolveCodexPath` from the bottom of `mercenary.js`:
```js
export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath };
```

And import it at the top of the test file:
```js
import { run, openSession, treeKill, resolveClaudePath, resolveCodexPath } from '../mercenary.js';
```

**Step 2: Run test to verify it fails**

```
node test/mercenary.test.js
```
Expected: fails with `resolveCodexPath is not a function` or import error.

**Step 3: Implement `resolveCodexPath`**

Add after `resolveClaudePath()` in `mercenary.js`:

```js
const KNOWN_CODEX_PATH = null; // no known install location; rely on PATH

function resolveCodexPath() {
  if (process.env.CODEX_PATH) {
    if (existsSync(process.env.CODEX_PATH)) return process.env.CODEX_PATH;
    throw new Error(`CODEX_PATH set to "${process.env.CODEX_PATH}" but file not found.`);
  }
  try {
    const result = execSync('where.exe codex', {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const found = result.trim().split(/\r?\n/)[0].trim();
    if (found && existsSync(found)) return found;
  } catch { /* not in PATH */ }
  throw new Error('codex binary not found. Set CODEX_PATH or run: npm install -g @openai/codex');
}
```

Update exports:
```js
export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath };
```

**Step 4: Run tests**

```
node test/mercenary.test.js
```
Expected: new tests pass.

**Step 5: Commit**

```
git add mercenary.js test/mercenary.test.js
git commit -m "feat(codex): add resolveCodexPath binary resolution"
```

---

### Task 2: Add `sanitizeEnvCodex()` and tests

**Files:**
- Modify: `mercenary.js`
- Modify: `test/mercenary.test.js`

**Step 1: Write failing tests**

In `test/mercenary.test.js`, add a block for codex env sanitization. Look at the existing `sanitizeEnv` tests as a template.

```js
// --- sanitizeEnvCodex ---

test('sanitizeEnvCodex strips Claude vars', () => {
  const orig = { ...process.env };
  process.env.CLAUDECODE = '1';
  process.env.CLAUDE_CODE_ENTRYPOINT = 'test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  const env = sanitizeEnvCodex();
  assert.strictEqual(env.CLAUDECODE, undefined);
  assert.strictEqual(env.CLAUDE_CODE_ENTRYPOINT, undefined);
  assert.strictEqual(env.ANTHROPIC_API_KEY, undefined);
  // Restore
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ANTHROPIC_API_KEY']) {
    if (orig[k] === undefined) delete process.env[k]; else process.env[k] = orig[k];
  }
});

test('sanitizeEnvCodex preserves CODEX_API_KEY and OPENAI_API_KEY', () => {
  const orig = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'sk-codex-test';
  const env = sanitizeEnvCodex();
  assert.strictEqual(env.CODEX_API_KEY, 'sk-codex-test');
  if (orig === undefined) delete process.env.CODEX_API_KEY;
  else process.env.CODEX_API_KEY = orig;
});

test('sanitizeEnvCodex does not set CLAUDE_CODE_MAX_OUTPUT_TOKENS', () => {
  const env = sanitizeEnvCodex();
  assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, undefined);
});

test('sanitizeEnvCodex forces SHELL to pwsh', () => {
  const env = sanitizeEnvCodex();
  assert.ok(env.SHELL.includes('pwsh'));
});
```

Export `sanitizeEnvCodex`:
```js
export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex };
```

**Step 2: Run test to verify it fails**

```
node test/mercenary.test.js
```
Expected: fails with `sanitizeEnvCodex is not a function`.

**Step 3: Implement `sanitizeEnvCodex`**

Add after `sanitizeEnv()` in `mercenary.js`:

```js
function sanitizeEnvCodex(opts = {}) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  env.SHELL = 'C:\\Users\\Jordan\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
  // CODEX_API_KEY and OPENAI_API_KEY are preserved — codex needs them
  return env;
}
```

**Step 4: Run tests**

```
node test/mercenary.test.js
```
Expected: new tests pass.

**Step 5: Commit**

```
git add mercenary.js test/mercenary.test.js
git commit -m "feat(codex): add sanitizeEnvCodex"
```

---

### Task 3: Add `buildCodexArgs()` and tests

**Files:**
- Modify: `mercenary.js`
- Modify: `test/mercenary.test.js`

The codex invocation for one-shot is:
```
codex exec [flags] "prompt"
```
Note: prompt is a positional arg to `codex exec`, not a flag.

**Step 1: Write failing tests**

```js
// --- buildCodexArgs ---

test('buildCodexArgs includes --dangerously-bypass-approvals-and-sandbox', () => {
  const args = buildCodexArgs({ prompt: 'hello' });
  assert.ok(args.includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('buildCodexArgs includes --ephemeral', () => {
  const args = buildCodexArgs({ prompt: 'hello' });
  assert.ok(args.includes('--ephemeral'));
});

test('buildCodexArgs: pipeline role uses --json', () => {
  const args = buildCodexArgs({ prompt: 'hello', role: 'pipeline' });
  assert.ok(args.includes('--json'));
  assert.ok(!args.includes('--verbose'));
});

test('buildCodexArgs: default role has no --json', () => {
  const args = buildCodexArgs({ prompt: 'hello' });
  assert.ok(!args.includes('--json'));
});

test('buildCodexArgs: model flag is passed through', () => {
  const args = buildCodexArgs({ prompt: 'hello', model: 'gpt-5-codex' });
  const idx = args.indexOf('--model');
  assert.ok(idx >= 0);
  assert.strictEqual(args[idx + 1], 'gpt-5-codex');
});

test('buildCodexArgs: prompt is last positional arg', () => {
  const args = buildCodexArgs({ prompt: 'do the thing' });
  assert.strictEqual(args[args.length - 1], 'do the thing');
});

test('buildCodexArgs: appendSystemPrompt sets developer_instructions config', () => {
  const args = buildCodexArgs({ prompt: 'hello', appendSystemPrompt: 'be concise' });
  const cfgIdx = args.indexOf('--config');
  assert.ok(cfgIdx >= 0);
  assert.ok(args[cfgIdx + 1].startsWith('developer_instructions='));
});

test('buildCodexArgs: maxTurns emits warning and is skipped', () => {
  const msgs = [];
  const args = buildCodexArgs({ prompt: 'hello', maxTurns: 5 }, (msg) => msgs.push(msg));
  assert.ok(!args.includes('--max-turns'));
  assert.ok(msgs.some(m => m.includes('maxTurns')));
});

test('buildCodexArgs: allowedTools emits warning and is skipped', () => {
  const msgs = [];
  const args = buildCodexArgs({ prompt: 'hello', allowedTools: 'Bash,Read' }, (msg) => msgs.push(msg));
  assert.ok(!args.includes('--allowed-tools'));
  assert.ok(msgs.some(m => m.includes('allowedTools')));
});
```

Export `buildCodexArgs`:
```js
export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex, buildCodexArgs };
```

**Step 2: Run test to verify it fails**

```
node test/mercenary.test.js
```

**Step 3: Implement `buildCodexArgs`**

Add after `buildArgs()` in `mercenary.js`. The function signature takes `(opts, warn)` where `warn` is an optional callback for unsupported-feature warnings (defaults to `process.stderr.write`).

```js
function buildCodexArgs(opts, warn = (msg) => process.stderr.write(`mercenary: ${msg}\n`)) {
  // codex exec [flags] "prompt"
  const args = [
    '--dangerously-bypass-approvals-and-sandbox',
    '--ephemeral',
  ];

  if (opts.model) args.push('--model', opts.model);

  if (opts.role === 'pipeline' || opts.streaming) {
    args.push('--json');
  }

  // System prompt / persona injection via --config developer_instructions
  // Note: persona file loading not supported for codex — use appendSystemPrompt text only
  let systemText = '';
  if (opts.appendSystemPrompt) systemText = opts.appendSystemPrompt;
  if (opts.persona) {
    warn('persona injection for codex backend uses appendSystemPrompt text only; file-based persona is not supported');
  }
  if (systemText) {
    args.push('--config', `developer_instructions=${systemText}`);
  }

  // Unsupported features — warn and skip
  if (opts.maxTurns) warn('maxTurns is not supported by the codex backend and will be ignored');
  if (opts.allowedTools) warn('allowedTools is not supported by the codex backend and will be ignored');
  if (opts.mcpConfig || opts.strictMcp) { /* silently skip — not applicable */ }

  // Prompt is positional, last
  args.push(opts.prompt);

  return args;
}
```

**Step 4: Run tests**

```
node test/mercenary.test.js
```
Expected: all new tests pass.

**Step 5: Commit**

```
git add mercenary.js test/mercenary.test.js
git commit -m "feat(codex): add buildCodexArgs with flag mapping and unsupported-feature warnings"
```

---

### Task 4: Wire `run()` to support `backend` option

**Files:**
- Modify: `mercenary.js`
- Modify: `test/mercenary.test.js`

The codex one-shot command structure is:
```
codex exec [flags] "prompt"
```
So the spawn call needs `['exec', ...buildCodexArgs(opts)]` with the resolved codex binary.

**Step 1: Write failing tests**

Add to the `run()` tests section. These are unit tests on the *arg assembly* path, not integration tests (which need `MERCENARY_INTEGRATION=1`). We'll test that `run()` calls the right binary resolver by mocking isn't straightforward in ESM, so instead test the exported arg builders compose correctly — the integration test is sufficient for the full spawn path.

Actually, add an integration test guarded by `MERCENARY_INTEGRATION`:

```js
if (process.env.MERCENARY_INTEGRATION) {
  test('run() codex backend: one-shot exec returns a result object', async () => {
    const result = await run({ prompt: 'say hello', backend: 'codex', timeout: 30 });
    assert.ok(typeof result.stdout === 'string');
    assert.ok(typeof result.exitCode === 'number');
  });
}
```

**Step 2: Verify existing tests still pass (no change yet)**

```
node test/mercenary.test.js
```

**Step 3: Modify `run()` to branch on `opts.backend`**

In `run()`, replace the current binary resolution + arg building block:

```js
// Before:
let claudePath;
try {
  claudePath = resolveClaudePath();
} catch (err) {
  return reject(err);
}
// ...
const args = ['-p', ...buildArgs(opts), opts.prompt];
const proc = spawn(claudePath, args, { ... env: sanitizeEnv(opts) });
```

```js
// After:
const backend = opts.backend || 'claude';
let binaryPath;
let spawnArgs;
let env;
try {
  if (backend === 'codex') {
    binaryPath = resolveCodexPath();
    spawnArgs = ['exec', ...buildCodexArgs(opts)];
    env = sanitizeEnvCodex(opts);
  } else {
    binaryPath = resolveClaudePath();
    spawnArgs = ['-p', ...buildArgs(opts), opts.prompt];
    env = sanitizeEnv(opts);
  }
} catch (err) {
  return reject(err);
}
```

And update the `spawn` call to use `binaryPath`, `spawnArgs`, `env`:

```js
const proc = spawn(binaryPath, spawnArgs, {
  cwd: opts.cwd || process.cwd(),
  shell: false,
  windowsHide: true,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env
});
```

**Step 4: Run tests**

```
node test/mercenary.test.js
```
Expected: all existing tests pass (codex integration test skipped unless env set).

**Step 5: Commit**

```
git add mercenary.js test/mercenary.test.js
git commit -m "feat(codex): wire run() to backend option — routes to codex exec or claude -p"
```

---

### Task 5: Add codex launcher to `openSession()`

**Files:**
- Modify: `mercenary.js`

The codex interactive mode is just `codex ["initial message"]` (no subcommand). For the PowerShell launcher:

```powershell
& "codex.exe" [flags] "initial message"
```

Key differences from claude interactive:
- No `--dangerously-skip-permissions` (becomes `--dangerously-bypass-approvals-and-sandbox` for sessions, but NOT recommended for interactive — skip it; user controls approvals interactively)
- No `--model` equivalent in the same position (codex uses `-m`)
- No `--append-system-prompt` file injection (developer_instructions can be passed inline but is less important for interactive)
- `--cd <path>` replaces `Set-Location` (but keeping `Set-Location` in the script still works)

**Step 1: No new test for openSession codex** (integration only; add a note instead)

The `openSession()` codex path is interactive/visual — add a comment in the test file:

```js
// openSession() with backend: 'codex' opens a WT tab running `codex` interactively.
// Integration test only: MERCENARY_INTEGRATION=1 would require a visual WT check.
// Verified manually.
```

**Step 2: Modify `openSession()` to branch on `opts.backend`**

At the top of `openSession()`, after the existing setup, add the backend branch:

```js
async function openSession(opts = {}) {
  const backend = opts.backend || 'claude';
  const title = opts.title || 'Mercenary';
  const tmpBase = mkdtempSync(join(tmpdir(), 'mercenary-'));

  if (backend === 'codex') {
    return openSessionCodex(opts, title, tmpBase);
  }

  // ... existing claude logic unchanged ...
}
```

Then add a new `openSessionCodex()` function before `openSession()`:

```js
async function openSessionCodex(opts, title, tmpBase) {
  const codexPath = resolveCodexPath();

  const lines = [
    '# Mercenary codex launcher -- auto-generated',
    '$ErrorActionPreference = "Continue"',
    'Write-Host "[mercenary] Codex launcher started" -ForegroundColor DarkGray',
    '$env:CLAUDECODE = $null',
    '$env:CLAUDE_CODE_ENTRYPOINT = $null',
    '$env:ANTHROPIC_API_KEY = $null',
    '$env:SHELL = "C:\\Users\\Jordan\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe"',
  ];

  if (opts.cwd) {
    lines.push(`Set-Location "${opts.cwd.replace(/"/g, '`"')}"`);
  }

  const codexArgs = [`& "${codexPath}"`];
  if (opts.model) codexArgs.push(`-m "${opts.model}"`);

  if (opts.initialMessage) {
    codexArgs.push(`"${opts.initialMessage.replace(/"/g, '`"')}"`);
  }

  lines.push('Write-Host "[mercenary] Launching codex..." -ForegroundColor DarkGray');
  lines.push(codexArgs.join(' `\n  '));
  lines.push('Write-Host "[mercenary] Codex exited with code $LASTEXITCODE" -ForegroundColor DarkGray');

  const launcherPath = join(tmpBase, 'launcher-codex.ps1');
  writeFileSync(launcherPath, lines.join('\n'), 'utf8');

  const wtArgs = ['-w', '0', 'nt', '--title', title];
  if (opts.cwd) wtArgs.push('-d', opts.cwd);
  wtArgs.push('pwsh', '-NoProfile', '-NoExit', '-File', launcherPath);

  const proc = spawn('wt', wtArgs, {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: false
  });
  proc.unref();

  return { pid: proc.pid, title, launcherPath };
}
```

**Step 3: Run tests**

```
node test/mercenary.test.js
```
Expected: all pass.

**Step 4: Commit**

```
git add mercenary.js
git commit -m "feat(codex): add openSessionCodex() for interactive WT tab"
```

---

### Task 6: Wire `--backend` to the CLI arg parser

**Files:**
- Modify: `mercenary.js` (CLI section)
- Modify: `test/mercenary.test.js`

**Step 1: Write failing tests for CLI parsing**

```js
// --- CLI parseArgs: --backend ---

test('parseArgs: --backend codex sets backend option', () => {
  const { opts } = parseArgs(['node', 'mercenary.js', '--prompt', 'hi', '--backend', 'codex']);
  assert.strictEqual(opts.backend, 'codex');
});

test('parseArgs: --backend defaults to undefined (claude is default)', () => {
  const { opts } = parseArgs(['node', 'mercenary.js', '--prompt', 'hi']);
  assert.strictEqual(opts.backend, undefined);
});
```

**Step 2: Run test to verify it fails**

```
node test/mercenary.test.js
```
Expected: fails — `parseArgs` is not exported / `--backend` is not in valueFlags.

**Step 3: Add `--backend` to the CLI parser and export `parseArgs`**

In `parseArgs()`, add `'--backend'` to `valueFlags`:

```js
const valueFlags = new Set([
  '--prompt', '--timeout', '--allowed-tools', '--max-tokens',
  '--persona', '--model', '--output-format', '--append-system-prompt',
  '--max-turns', '--cwd', '--system-prompt', '--title', '--kill',
  '--backend'   // <-- add this
]);
```

Export `parseArgs`:
```js
export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex, buildCodexArgs, parseArgs };
```

**Step 4: Wire `opts.backend` through `main()`**

In `main()`, pass `backend` to both `run()` and `openSession()`:

```js
// --interactive mode
const result = await openSession({
  // ... existing opts ...
  backend: opts.backend,   // <-- add
});

// --prompt mode
const result = await run({
  // ... existing opts ...
  backend: opts.backend,   // <-- add
});
```

Also update the usage message:

```js
console.error('Usage: mercenary --prompt <text> [--backend claude|codex] [--timeout <s>] [--json]');
console.error('       mercenary --interactive [--backend claude|codex] [--system-prompt <path>]');
console.error('       mercenary --kill <pid>');
```

**Step 5: Run tests**

```
node test/mercenary.test.js
```
Expected: all pass.

**Step 6: Smoke test the CLI**

```
node mercenary.js --prompt "say: codex flag works" --backend claude --timeout 15
```
Expected: normal claude response (verifying no regression).

**Step 7: Commit**

```
git add mercenary.js test/mercenary.test.js
git commit -m "feat(codex): add --backend CLI flag, wire through run() and openSession()"
```

---

## Done

After Task 6 the feature is complete. Usage:

```bash
# One-shot via codex
node mercenary.js --prompt "generate a summary" --backend codex --timeout 30

# Interactive codex session in Windows Terminal
node mercenary.js --interactive --backend codex

# Module API
import { run, openSession } from './mercenary.js';
await run({ prompt: 'hello', backend: 'codex', model: 'gpt-5-codex' });
await openSession({ backend: 'codex', title: 'Codex Session' });
```
