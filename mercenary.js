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

// --- Environment Sanitization ---

function sanitizeEnv(opts = {}) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY;
  env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(opts.maxTokens || 65536);
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
  if (opts.outputFormat) args.push('--output-format', opts.outputFormat);
  if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));

  // Persona first, then user's append-system-prompt
  let appendSystemPrompt = '';
  if (opts.persona) {
    appendSystemPrompt += loadPersona(opts.persona);
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

// --- One-shot Mode ---

function run(opts = {}) {
  return new Promise((resolve, reject) => {
    let claudePath;
    try {
      claudePath = resolveClaudePath();
    } catch (err) {
      return reject(err);
    }

    if (!opts.prompt) return reject(new Error('prompt is required'));

    const args = ['-p', ...buildArgs(opts), opts.prompt];
    const startTime = Date.now();

    const proc = spawn(claudePath, args, {
      cwd: opts.cwd || process.cwd(),
      shell: false,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: sanitizeEnv(opts)
    });
    proc.unref();

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timer = null;

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

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

async function openSession(opts = {}) {
  const claudePath = resolveClaudePath();
  const title = opts.title || 'Mercenary';
  const tmpBase = mkdtempSync(join(tmpdir(), 'mercenary-'));

  // Build launcher PowerShell script
  const lines = [
    '# Mercenary launcher -- auto-generated',
    '$env:CLAUDECODE = $null',
    '$env:CLAUDE_CODE_ENTRYPOINT = $null',
    '$env:ANTHROPIC_API_KEY = $null',
    `$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = "${opts.maxTokens || 65536}"`,
  ];

  // Build claude invocation args
  const claudeArgs = [`& "${claudePath}"`, '--dangerously-skip-permissions', '--no-session-persistence'];

  // System prompt (write to temp file to avoid escaping issues)
  if (opts.systemPrompt) {
    const promptFile = join(tmpBase, 'system-prompt.txt');
    writeFileSync(promptFile, opts.systemPrompt, 'utf8');
    claudeArgs.push(`--system-prompt (Get-Content "${promptFile}" -Raw)`);
  }

  // Persona + append-system-prompt
  let appendSystemPrompt = '';
  if (opts.persona) {
    appendSystemPrompt += loadPersona(opts.persona);
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

  // Initial message as positional arg
  if (opts.initialMessage) {
    claudeArgs.push(`"${opts.initialMessage.replace(/"/g, '`"')}"`);
  }

  lines.push(claudeArgs.join(' `\n  '));

  const launcherPath = join(tmpBase, 'launcher.ps1');
  writeFileSync(launcherPath, lines.join('\n'), 'utf8');

  // Spawn Windows Terminal
  const proc = spawn('wt', [
    '-w', '0', 'nt', '--title', title,
    'pwsh', '-NoProfile', '-NoExit', '-File', launcherPath
  ], {
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
    '--max-turns', '--cwd', '--system-prompt', '--title', '--kill'
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
  console.error('Usage: mercenary --prompt <text> [--timeout <s>] [--json]');
  console.error('       mercenary --interactive [--system-prompt <path>]');
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

export { run, openSession, treeKill, resolveClaudePath };
