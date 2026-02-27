#!/usr/bin/env node

// mercenary.js -- Claude Code subprocess wrapper for Windows
// Single file: module exports + CLI entry point

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ALLMIND_PERSONA_PATH = 'P:\\software\\allmind\\data\\persona\\allmind-voice.md';
const KNOWN_CLAUDE_PATH = 'C:\\Users\\Jordan\\.local\\bin\\claude.exe';
const GRACE_PERIOD_MS = 5000;

// --- Binary Resolution ---

function resolveClaudePath() {
  if (process.env.CLAUDE_PATH) {
    if (existsSync(process.env.CLAUDE_PATH)) return process.env.CLAUDE_PATH;
    throw new Error(`CLAUDE_PATH set to "${process.env.CLAUDE_PATH}" but file not found.`);
  }
  if (existsSync(KNOWN_CLAUDE_PATH)) return KNOWN_CLAUDE_PATH;
  try {
    const result = execSync('where.exe claude', {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const found = result.trim().split(/\r?\n/)[0].trim();
    if (found && existsSync(found)) return found;
  } catch { /* not in PATH */ }
  throw new Error('claude binary not found. Set CLAUDE_PATH or ensure claude is installed.');
}

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

// --- Environment Sanitization ---

function sanitizeEnv(opts = {}) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY;
  env.SHELL = 'C:\\Users\\Jordan\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
  env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(opts.maxTokens || 65536);
  return env;
}

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

// --- Process Tree Kill ---

function treeKill(pid) {
  try {
    execSync(`taskkill /T /F /PID ${pid}`, { windowsHide: true, stdio: 'ignore' });
  } catch {
    // Process already dead -- ignore
  }
}

// --- Persona ---

function loadPersona(personaPath) {
  const content = readFileSync(personaPath, 'utf8');
  return `<persona>\n${content}\n</persona>`;
}

// --- Arg Builder (one-shot) ---

function buildArgs(opts) {
  const args = ['--dangerously-skip-permissions', '--no-session-persistence'];

  if (opts.allowedTools) args.push('--allowed-tools', opts.allowedTools);
  if (opts.model) args.push('--model', opts.model);
  // Role-based preset — callers declare what they are, not which flags they need.
  // role: 'pipeline' → headless agent, structured streaming output (stream-json + verbose)
  //                     + --strict-mcp-config to block project-level .mcp.json (global mcpServers is empty)
  // role: 'allmind'  → AllMind-voiced session, plain text output + persona injection
  // streaming: true  → legacy alias for pipeline
  if (opts.role === 'pipeline' || opts.streaming) {
    args.push('--output-format', 'stream-json', '--verbose');
    args.push('--strict-mcp-config');
    // --strict-mcp-config blocks project-level .mcp.json from loading.
    // No mcp-none.json fallback needed — global mcpServers is empty by design.
  } else if (opts.role === 'allmind') {
    args.push('--output-format', 'text');
  } else if (opts.outputFormat) {
    args.push('--output-format', opts.outputFormat);
    if (opts.verbose) args.push('--verbose');
  }
  if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));

  // MCP config: pass --mcp-config with a JSON string or file path.
  // Combine with --strict-mcp-config (set by pipeline role or explicitly) to load ONLY these servers.
  if (opts.mcpConfig) args.push('--mcp-config', opts.mcpConfig);
  if (opts.strictMcp && !args.includes('--strict-mcp-config')) args.push('--strict-mcp-config');

  // Persona first, then user's append-system-prompt
  // role: 'allmind' defaults to the AllMind persona path; caller can override with opts.persona
  const persona = opts.persona || (opts.role === 'allmind' ? ALLMIND_PERSONA_PATH : null);
  let appendSystemPrompt = '';
  if (persona) {
    appendSystemPrompt += loadPersona(persona);
  }
  if (opts.appendSystemPrompt) {
    if (appendSystemPrompt) appendSystemPrompt += '\n\n';
    appendSystemPrompt += opts.appendSystemPrompt;
  }
  if (appendSystemPrompt) {
    args.push('--append-system-prompt', appendSystemPrompt);
  }

  return args;
}

// --- Arg Builder (codex one-shot) ---

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

  // System prompt injection via --config developer_instructions
  // File-based persona not supported; appendSystemPrompt text only
  if (opts.persona) {
    warn('persona injection for codex backend uses appendSystemPrompt text only; file-based persona is not supported');
  }
  if (opts.appendSystemPrompt) {
    args.push('--config', `developer_instructions=${opts.appendSystemPrompt}`);
  }

  // Unsupported features — warn and skip
  if (opts.maxTurns) warn('maxTurns is not supported by the codex backend and will be ignored');
  if (opts.allowedTools) warn('allowedTools is not supported by the codex backend and will be ignored');
  // mcpConfig / strictMcp — not applicable to codex, skip silently

  // Prompt is positional, last
  args.push(opts.prompt);

  return args;
}

// --- One-shot Mode ---

function run(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!opts.prompt) return reject(new Error('prompt is required'));

    const backend = opts.backend || 'claude';
    let binaryPath, spawnArgs, env;
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

    const startTime = Date.now();

    const proc = spawn(binaryPath, spawnArgs, {
      cwd: opts.cwd || process.cwd(),
      shell: false,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    });
    proc.unref();

    // Notify caller of PID synchronously (still inside Promise executor)
    if (opts.onStart) opts.onStart(proc.pid);

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timer = null;

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (opts.onData) opts.onData(chunk, 'stdout');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (opts.onData) opts.onData(chunk, 'stderr');
    });

    if (opts.timeout) {
      const timeoutMs = opts.timeout * 1000;
      timer = setTimeout(() => {
        killed = true;
        treeKill(proc.pid);
        setTimeout(() => { treeKill(proc.pid); }, GRACE_PERIOD_MS);
      }, timeoutMs);
    }

    proc.on('close', (exitCode) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: killed ? 124 : (exitCode ?? 1),
        timedOut: killed,
        durationMs: Date.now() - startTime,
        pid: proc.pid
      });
    });

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

// --- Interactive Mode ---

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

async function openSession(opts = {}) {
  const backend = opts.backend || 'claude';
  const title = opts.title || 'Mercenary';
  const tmpBase = mkdtempSync(join(tmpdir(), 'mercenary-'));

  if (backend === 'codex') {
    return openSessionCodex(opts, title, tmpBase);
  }

  const claudePath = resolveClaudePath();

  // Role-based preset — callers declare what they are, not which flags they need.
  // role: 'coordinator' → interactive observer with standard pipeline toolset + no user MCP servers
  const allowedTools = opts.allowedTools ??
    (opts.role === 'coordinator' ? 'Bash,Read,Edit,Write,Glob,Grep' : undefined);
  // Coordinator sessions are interactive (visible terminal) — MCP suppression
  // caused hangs; coordinators don't need strict MCP since they're supervised.
  const strictMcp = opts.strictMcp ?? false;

  // Build launcher PowerShell script
  const lines = [
    '# Mercenary launcher -- auto-generated',
    '$ErrorActionPreference = "Continue"',
    'Write-Host "[mercenary] Launcher started" -ForegroundColor DarkGray',
    '$env:CLAUDECODE = $null',
    '$env:CLAUDE_CODE_ENTRYPOINT = $null',
    '$env:ANTHROPIC_API_KEY = $null',
    '$env:SHELL = "C:\\Users\\Jordan\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe"',
    `$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = "${opts.maxTokens || 65536}"`,
  ];

  // Set working directory before launching claude
  if (opts.cwd) {
    lines.push(`Set-Location "${opts.cwd.replace(/"/g, '`"')}"`);
  }

  // Build claude invocation args
  const claudeArgs = [`& "${claudePath}"`, '--dangerously-skip-permissions'];

  // Tool restrictions
  if (allowedTools) {
    claudeArgs.push(`--allowed-tools "${allowedTools}"`);
  }

  // Model selection
  if (opts.model) {
    claudeArgs.push(`--model "${opts.model}"`);
  }

  // System prompt (write to temp file to avoid escaping issues)
  if (opts.systemPrompt) {
    const promptFile = join(tmpBase, 'system-prompt.txt');
    writeFileSync(promptFile, opts.systemPrompt, 'utf8');
    claudeArgs.push(`--system-prompt (Get-Content "${promptFile}" -Raw)`);
  }

  // Persona + append-system-prompt
  // role: 'allmind' defaults to the AllMind persona path; caller can override with opts.persona
  const sessionPersona = opts.persona || (opts.role === 'allmind' ? ALLMIND_PERSONA_PATH : null);
  let appendSystemPrompt = '';
  if (sessionPersona) {
    appendSystemPrompt += loadPersona(sessionPersona);
  }
  if (opts.appendSystemPrompt) {
    if (appendSystemPrompt) appendSystemPrompt += '\n\n';
    appendSystemPrompt += opts.appendSystemPrompt;
  }
  if (appendSystemPrompt) {
    const appendFile = join(tmpBase, 'append-prompt.txt');
    writeFileSync(appendFile, appendSystemPrompt, 'utf8');
    claudeArgs.push(`--append-system-prompt (Get-Content "${appendFile}" -Raw)`);
  }

  // MCP config control — block project-level .mcp.json for headless/pipeline roles
  // No mcp-none.json fallback needed — global mcpServers is empty by design.
  if (strictMcp) {
    claudeArgs.push('--strict-mcp-config');
  }
  if (opts.mcpConfig) claudeArgs.push(`--mcp-config "${opts.mcpConfig.replace(/"/g, '`"')}"`);

  // Initial message as positional arg
  if (opts.initialMessage) {
    claudeArgs.push(`"${opts.initialMessage.replace(/"/g, '`"')}"`);
  }

  // Read system prompt / append prompt into variables to avoid inline subexpression issues
  // and to log the content length for debugging
  lines.push('');
  lines.push('# Pre-load file-based args into variables');
  if (opts.systemPrompt) {
    const promptFile = join(tmpBase, 'system-prompt.txt');
    lines.push(`$spContent = Get-Content "${promptFile}" -Raw`);
    lines.push('Write-Host "[mercenary] System prompt: $($spContent.Length) chars" -ForegroundColor DarkGray');
    // Replace the (Get-Content ...) subexpression in claudeArgs with $spContent
    const idx = claudeArgs.findIndex(a => a.startsWith('--system-prompt'));
    if (idx >= 0) {
      claudeArgs[idx] = '--system-prompt $spContent';
    }
  }
  if (appendSystemPrompt) {
    const appendFile = join(tmpBase, 'append-prompt.txt');
    lines.push(`$apContent = Get-Content "${appendFile}" -Raw`);
    lines.push('Write-Host "[mercenary] Append prompt: $($apContent.Length) chars" -ForegroundColor DarkGray');
    const idx = claudeArgs.findIndex(a => a.startsWith('--append-system-prompt'));
    if (idx >= 0) {
      claudeArgs[idx] = '--append-system-prompt $apContent';
    }
  }
  lines.push('Write-Host "[mercenary] Launching claude..." -ForegroundColor DarkGray');
  lines.push(claudeArgs.join(' `\n  '));
  lines.push('Write-Host "[mercenary] Claude exited with code $LASTEXITCODE" -ForegroundColor DarkGray');

  const launcherPath = join(tmpBase, 'launcher.ps1');
  writeFileSync(launcherPath, lines.join('\n'), 'utf8');

  // Spawn Windows Terminal — pass cwd as -d so the tab opens in the right directory
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

// --- CLI Argument Parser ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  const positional = [];
  const booleanFlags = new Set(['--json', '--am', '--interactive']);
  const valueFlags = new Set([
    '--prompt', '--timeout', '--allowed-tools', '--max-tokens',
    '--persona', '--model', '--output-format', '--append-system-prompt',
    '--max-turns', '--cwd', '--system-prompt', '--title', '--kill',
    '--backend'
  ]);

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (booleanFlags.has(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = true;
      i++;
    } else if (valueFlags.has(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[++i];
      i++;
    } else if (arg.startsWith('--')) {
      process.stderr.write(`mercenary: unknown flag "${arg}", ignoring\n`);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) i += 2;
      else i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { opts, positional };
}

// --- CLI Entry Point ---

async function main() {
  const { opts, positional } = parseArgs(process.argv);

  // --kill mode
  if (opts.kill) {
    treeKill(Number(opts.kill));
    return;
  }

  // --interactive mode
  if (opts.interactive) {
    let systemPrompt;
    if (opts.systemPrompt) {
      systemPrompt = readFileSync(opts.systemPrompt, 'utf8');
    }

    const result = await openSession({
      systemPrompt,
      persona: opts.am ? ALLMIND_PERSONA_PATH : opts.persona,
      initialMessage: positional.join(' ') || undefined,
      title: opts.title,
      maxTokens: opts.maxTokens ? Number(opts.maxTokens) : undefined,
      appendSystemPrompt: opts.appendSystemPrompt,
      backend: opts.backend,
    });

    console.log(result.pid);
    return;
  }

  // --prompt mode (one-shot)
  if (opts.prompt) {
    const result = await run({
      prompt: opts.prompt,
      timeout: opts.timeout ? Number(opts.timeout) : undefined,
      allowedTools: opts.allowedTools,
      maxTokens: opts.maxTokens ? Number(opts.maxTokens) : undefined,
      persona: opts.am ? ALLMIND_PERSONA_PATH : opts.persona,
      model: opts.model,
      outputFormat: opts.outputFormat,
      appendSystemPrompt: opts.appendSystemPrompt,
      maxTurns: opts.maxTurns ? Number(opts.maxTurns) : undefined,
      cwd: opts.cwd,
      backend: opts.backend,
    });

    if (opts.json) {
      console.log(JSON.stringify(result));
      process.exit(0);
    } else {
      if (result.stdout) process.stdout.write(result.stdout + '\n');
      if (result.stderr) process.stderr.write(result.stderr + '\n');
      process.exit(result.exitCode);
    }
    return;
  }

  // No mode specified
  console.error('Usage: mercenary --prompt <text> [--backend claude|codex] [--timeout <s>] [--json]');
  console.error('       mercenary --interactive [--backend claude|codex] [--system-prompt <path>]');
  console.error('       mercenary --kill <pid>');
  process.exit(1);
}

// Run CLI if this file is the entry point
if (resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(`mercenary: ${err.message}`);
    process.exit(1);
  });
}

export { run, openSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex, buildCodexArgs, parseArgs };
