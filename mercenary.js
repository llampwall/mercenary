#!/usr/bin/env node

// mercenary.js -- Claude Code subprocess wrapper for Windows
// Single file: module exports + CLI entry point

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLMIND_PERSONA_PATH = 'P:\\software\\allmind\\config\\persona\\allmind-voice.md';
const KNOWN_CLAUDE_PATH = 'C:\\Users\\Jordan\\.local\\bin\\claude.exe';
const GRACE_PERIOD_MS = 5000;
const SAFE_CLI_CHARS = 20000;

const LEDGER_PATH = join(import.meta.dirname, '.process-ledger.json');
const SUSTAINED_DEATH_THRESHOLD = 3;   // consecutive dead checks before "resolved"
const PURGE_MONITOR_MINUTES = 3;       // how long purge watches after killing
const PURGE_CHECK_INTERVAL_MS = 15000; // 15s between purge checks

function estimateArgLength(args) {
  // Each arg: content + space separator + potential quoting overhead
  return args.reduce((sum, a) => sum + a.length + 3, 0);
}

function resolveExecutableCandidate(candidatePath) {
  if (!candidatePath) return null;
  if (process.platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(candidatePath)) {
    for (const suffix of ['.cmd', '.exe', '.bat']) {
      const withSuffix = `${candidatePath}${suffix}`;
      if (existsSync(withSuffix)) return withSuffix;
    }
  }
  if (existsSync(candidatePath)) return candidatePath;
  return null;
}

function resolveCodexNativeExecutable(candidatePath) {
  if (!candidatePath || process.platform !== 'win32') return null;

  const normalized = candidatePath.replace(/\//g, '\\').toLowerCase();
  if (!/(^|\\)codex(\.cmd|\.bat)?$/.test(normalized)) return null;

  const shimDir = dirname(candidatePath);
  const vendorCandidates = [
    join(
      shimDir,
      'node_modules', '@openai', 'codex', 'node_modules', '@openai',
      'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe'
    ),
    join(
      shimDir,
      'node_modules', '@openai', 'codex', 'node_modules', '@openai',
      'codex-win32-arm64', 'vendor', 'aarch64-pc-windows-msvc', 'codex', 'codex.exe'
    ),
  ];

  for (const vendorPath of vendorCandidates) {
    if (existsSync(vendorPath)) return vendorPath;
  }

  return null;
}

// --- Binary Resolution ---

function resolveBinary({ envVar, knownPaths = [], whereName, notFoundMsg }) {
  if (process.env[envVar]) {
    const resolvedEnvPath = resolveExecutableCandidate(process.env[envVar]);
    if (resolvedEnvPath) return resolvedEnvPath;
    throw new Error(`${envVar} set to "${process.env[envVar]}" but file not found. This is a system configuration issue — check that the path is correct in the PM2 ecosystem config (config/ecosystem.config.cjs) or data/.env.`);
  }
  for (const p of knownPaths) {
    const resolvedKnownPath = resolveExecutableCandidate(p);
    if (resolvedKnownPath) return resolvedKnownPath;
  }
  try {
    const result = execSync(`where.exe ${whereName}`, {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const found = result.trim().split(/\r?\n/)[0].trim();
    const resolvedFoundPath = resolveExecutableCandidate(found);
    if (resolvedFoundPath) return resolvedFoundPath;
  } catch { /* not in PATH */ }
  throw new Error(notFoundMsg);
}

function resolveClaudePath() {
  return resolveBinary({
    envVar: 'CLAUDE_PATH',
    knownPaths: [KNOWN_CLAUDE_PATH],
    whereName: 'claude',
    notFoundMsg: 'Claude CLI binary not found — this is a system configuration issue that requires operator intervention. Checked: CLAUDE_PATH env var, known path (C:\\Users\\Jordan\\.local\\bin\\claude.exe), and PATH lookup via where.exe. The operator needs to install Claude Code or set CLAUDE_PATH in the PM2 ecosystem config.',
  });
}

function resolveCodexPath() {
  const resolved = resolveBinary({
    envVar: 'CODEX_PATH',
    whereName: 'codex',
    notFoundMsg: 'Codex CLI binary not found — this is a system configuration issue that requires operator intervention. Checked: CODEX_PATH env var and PATH lookup via where.exe. The operator needs to install Codex (npm install -g @openai/codex) or set CODEX_PATH in the PM2 ecosystem config.',
  });
  return resolveCodexNativeExecutable(resolved) || resolved;
}

function collectCodexConfigPaths(cwd = process.cwd()) {
  const paths = [];
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (homeDir) paths.push(join(homeDir, '.codex', 'config.toml'));
  if (cwd) paths.push(join(cwd, '.codex', 'config.toml'));
  return paths.filter((p, index, arr) => arr.indexOf(p) === index && existsSync(p));
}

function collectCodexMcpServerNames(cwd = process.cwd()) {
  const names = new Set();
  const sectionPattern = /^\[mcp_servers\.([^. \]\r\n]+)(?:[.\]])/gm;

  for (const configPath of collectCodexConfigPaths(cwd)) {
    try {
      const raw = readFileSync(configPath, 'utf8');
      for (const match of raw.matchAll(sectionPattern)) {
        if (match[1]) names.add(match[1]);
      }
    } catch {
      // Ignore malformed or unreadable optional config files.
    }
  }

  return Array.from(names).sort();
}

function shouldDisableCodexMcp(opts = {}, mode = 'oneshot') {
  if (opts.disableMcp !== undefined) return Boolean(opts.disableMcp);

  if (mode === 'interactive') {
    return opts.role === 'coordinator' || opts.role === 'allmind';
  }

  return Boolean(opts.role === 'pipeline' || opts.role === 'repo-agent' || opts.streaming || opts.role === 'allmind');
}

function getDefaultCodexSandbox(opts = {}, mode = 'oneshot') {
  if (opts.sandbox) return opts.sandbox;

  if (mode === 'interactive') {
    return opts.role === 'coordinator' ? 'workspace-write' : undefined;
  }

  if (opts.role === 'pipeline' || opts.role === 'repo-agent' || opts.streaming) {
    return 'workspace-write';
  }

  return undefined;
}

// --- Environment Sanitization ---

function sanitizeEnv(opts = {}) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY;
  env.SHELL = 'C:\\Users\\Jordan\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';
  env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(opts.maxTokens || 65536);
  if (opts.useLocalModel) {
    env.ANTHROPIC_BASE_URL = opts.localModelUrl || 'http://127.0.0.1:4000';
  }
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

// --- Process Ledger ---

function readLedger(path = LEDGER_PATH) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, entries: {} };
    throw err;
  }
}

function writeLedger(ledger, path = LEDGER_PATH) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(ledger, null, 2), 'utf8');
  renameSync(tmp, path);
}

function checkPidAlive(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const lines = out.trim().split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/^"([^"]+)","(\d+)","([^"]+)","(\d+)","([^"]+)"$/);
      if (match && match[2] === String(pid)) {
        const memStr = match[5].replace(/[^\d]/g, '');
        return { alive: true, memoryKB: memStr ? Number(memStr) : null };
      }
    }
    return { alive: false, memoryKB: null };
  } catch {
    return { alive: false, memoryKB: null };
  }
}

function discoverProcesses() {
  const results = [];
  for (const imageName of ['claude.exe', 'codex.exe']) {
    try {
      const out = execSync(`tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`, {
        windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
      });
      const lines = out.trim().split(/\r?\n/).filter(l => l.trim());
      for (const line of lines) {
        const match = line.match(/^"([^"]+)","(\d+)","([^"]+)","(\d+)","([^"]+)"$/);
        if (match) {
          const memStr = match[5].replace(/[^\d]/g, '');
          results.push({ imageName: match[1], pid: Number(match[2]), memoryKB: memStr ? Number(memStr) : null });
        }
      }
    } catch { /* binary not running */ }
  }
  return results;
}

function ledgerRegister(info, path = LEDGER_PATH) {
  const ledger = readLedger(path);
  const now = new Date().toISOString();
  ledger.entries[String(info.pid)] = {
    pid: info.pid,
    backend: info.backend || 'claude',
    mode: info.mode || 'oneshot',
    binaryPath: info.binaryPath || null,
    spawnedAt: now,
    spawnedBy: process.pid,
    purpose: info.purpose ? String(info.purpose).slice(0, 200) : null,
    origin: info.origin ? String(info.origin).slice(0, 200) : null,
    prompt: info.prompt ? String(info.prompt).slice(0, 200) : null,
    cwd: info.cwd || process.cwd(),
    status: 'alive',
    lastCheckedAt: null,
    lastSeenAliveAt: now,
    memoryKB: null,
    deathConfirmedAt: null,
    deathSustainsCount: 0,
    killAttempts: 0,
    discoveredOrphan: false,
  };
  writeLedger(ledger, path);
}

function ledgerMarkDead(pid, path = LEDGER_PATH) {
  const ledger = readLedger(path);
  const entry = ledger.entries[String(pid)];
  if (!entry) return;
  entry.status = 'dead';
  entry.deathConfirmedAt = new Date().toISOString();
  entry.deathSustainsCount = SUSTAINED_DEATH_THRESHOLD;
  writeLedger(ledger, path);
}

function ledgerAudit(path = LEDGER_PATH) {
  const ledger = readLedger(path);
  const now = new Date().toISOString();

  for (const entry of Object.values(ledger.entries)) {
    if (entry.status === 'resolved') continue;
    const { alive, memoryKB } = checkPidAlive(entry.pid);
    entry.lastCheckedAt = now;
    if (alive) {
      entry.lastSeenAliveAt = now;
      entry.memoryKB = memoryKB;
      if (entry.status !== 'killing') entry.status = 'alive';
      entry.deathSustainsCount = 0;
    } else {
      if (entry.status !== 'dead' && entry.status !== 'killing') {
        entry.status = 'dead';
        if (!entry.deathConfirmedAt) entry.deathConfirmedAt = now;
      }
      entry.deathSustainsCount = (entry.deathSustainsCount || 0) + 1;
      if (entry.deathSustainsCount >= SUSTAINED_DEATH_THRESHOLD) {
        entry.status = 'resolved';
      }
    }
  }

  const discovered = discoverProcesses();
  for (const proc of discovered) {
    if (!ledger.entries[String(proc.pid)]) {
      ledger.entries[String(proc.pid)] = {
        pid: proc.pid,
        backend: proc.imageName.replace('.exe', ''),
        mode: 'unknown',
        binaryPath: null,
        spawnedAt: null,
        spawnedBy: null,
        purpose: null,
        origin: null,
        prompt: null,
        cwd: null,
        status: 'orphan',
        lastCheckedAt: now,
        lastSeenAliveAt: now,
        memoryKB: proc.memoryKB,
        deathConfirmedAt: null,
        deathSustainsCount: 0,
        killAttempts: 0,
        discoveredOrphan: true,
      };
    }
  }

  writeLedger(ledger, path);
  return ledger;
}

function ledgerStatus(path = LEDGER_PATH) {
  const ledger = ledgerAudit(path);
  const entries = Object.values(ledger.entries);
  if (!entries.length) return 'No tracked processes.';

  const lines = [
    `${'PID'.padEnd(8)} ${'STATUS'.padEnd(10)} ${'MODE'.padEnd(12)} ${'BACKEND'.padEnd(8)} ${'MEM(KB)'.padEnd(10)} ${'SPAWNED'.padEnd(26)} ${'ORIGIN'.padEnd(20)} ${'PURPOSE'.padEnd(30)} ORPHAN`,
    '-'.repeat(130),
  ];
  for (const e of entries.sort((a, b) => a.pid - b.pid)) {
    const mem = e.memoryKB != null ? String(e.memoryKB) : '-';
    const spawned = e.spawnedAt ? e.spawnedAt.replace('T', ' ').slice(0, 23) : '-';
    const origin = (e.origin || '-').slice(0, 18);
    const purpose = (e.purpose || '-').slice(0, 28);
    const orphan = e.discoveredOrphan ? 'yes' : 'no';
    lines.push(
      `${String(e.pid).padEnd(8)} ${e.status.padEnd(10)} ${e.mode.padEnd(12)} ${e.backend.padEnd(8)} ${mem.padEnd(10)} ${spawned.padEnd(26)} ${origin.padEnd(20)} ${purpose.padEnd(30)} ${orphan}`
    );
  }
  return lines.join('\n');
}

async function ledgerPurge(path = LEDGER_PATH) {
  const log = (msg) => process.stdout.write(`[purge] ${msg}\n`);

  log('Phase 1: Initial kill pass...');
  let ledger = ledgerAudit(path);
  const toKill = Object.values(ledger.entries).filter(
    e => ['alive', 'orphan', 'killing'].includes(e.status)
  );

  if (!toKill.length) {
    log('No active processes to purge.');
    return;
  }

  for (const entry of toKill) {
    log(`Killing PID ${entry.pid} (${entry.backend} ${entry.mode})...`);
    entry.status = 'killing';
    entry.killAttempts = (entry.killAttempts || 0) + 1;
    treeKill(entry.pid);
  }
  writeLedger(ledger, path);

  log(`Phase 2: Monitoring for ${PURGE_MONITOR_MINUTES} minutes (check every ${PURGE_CHECK_INTERVAL_MS / 1000}s)...`);
  const deadline = Date.now() + PURGE_MONITOR_MINUTES * 60 * 1000;
  let iteration = 0;

  while (Date.now() < deadline) {
    await sleep(PURGE_CHECK_INTERVAL_MS);
    iteration++;
    log(`Check ${iteration}...`);

    ledger = ledgerAudit(path);
    const survivors = Object.values(ledger.entries).filter(
      e => ['alive', 'orphan', 'killing'].includes(e.status)
    );

    if (!survivors.length) {
      log('All processes confirmed dead.');
      break;
    }

    for (const entry of survivors) {
      log(`Re-killing PID ${entry.pid} (attempt ${(entry.killAttempts || 0) + 1})...`);
      entry.killAttempts = (entry.killAttempts || 0) + 1;
      entry.status = 'killing';
      treeKill(entry.pid);
    }
    writeLedger(ledger, path);
  }

  log('Phase 3: Final report...');
  ledger = ledgerAudit(path);
  const unresolved = Object.values(ledger.entries).filter(
    e => !['resolved', 'dead'].includes(e.status)
  );

  if (unresolved.length) {
    log(`WARNING: ${unresolved.length} process(es) could not be confirmed dead:`);
    for (const e of unresolved) {
      log(`  PID ${e.pid} (${e.backend}) - status: ${e.status}, kill attempts: ${e.killAttempts}`);
    }
  } else {
    log('All processes purged successfully.');
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

  // Resume or session-id -- both require session persistence, so remove the no-persistence flag
  if (opts.resume || opts.sessionId) {
    const idx = args.indexOf('--no-session-persistence');
    if (idx !== -1) args.splice(idx, 1);
    if (opts.resume) args.push('--resume', opts.resume);
    if (opts.sessionId) args.push('--session-id', opts.sessionId);
  }

  if (opts.allowedTools) args.push('--allowed-tools', opts.allowedTools);
  if (opts.model) args.push('--model', opts.model);
  // Role-based preset — callers declare what they are, not which flags they need.
  // role: 'pipeline' → headless agent, structured streaming output (stream-json + verbose)
  //                     + --strict-mcp-config to block project-level .mcp.json (global mcpServers is empty)
  // role: 'allmind'  → AllMind-voiced session, plain text output + persona injection
  // streaming: true  → legacy alias for pipeline
  if (opts.role === 'pipeline' || opts.role === 'repo-agent' || opts.streaming) {
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
    // If the content is large, write to a temp file to avoid ENAMETOOLONG on Windows.
    // Claude CLI supports --append-system-prompt-file natively.
    if (appendSystemPrompt.length > 8000) {
      const tmpDir = opts._tempDir || mkdtempSync(join(tmpdir(), 'mercenary-'));
      const promptFile = join(tmpDir, 'append-system-prompt.txt');
      writeFileSync(promptFile, appendSystemPrompt, 'utf8');
      args.push('--append-system-prompt-file', promptFile);
      // Stash path so caller can clean up
      args._appendPromptTempFile = promptFile;
      args._appendPromptTempDir = tmpDir;
    } else {
      args.push('--append-system-prompt', appendSystemPrompt);
    }
  }

  return args;
}

// --- Arg Builder (codex one-shot) ---

function buildCodexArgs(opts, warn = (msg) => process.stderr.write(`mercenary: ${msg}\n`)) {
  // codex exec [flags] "prompt"
  const args = [];

  // Approval + sandbox policy.
  // If opts.sandbox is set, keep the sandbox and force non-interactive approval via config.
  // Otherwise default to full bypass (suitable for trusted automation).
  const sandbox = getDefaultCodexSandbox(opts, 'oneshot');
  if (sandbox) {
    args.push('--sandbox', sandbox, '--config', 'approval_policy="never"');
  } else {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  args.push('--ephemeral');

  if (opts.model) args.push('--model', opts.model);

  if (opts.role === 'pipeline' || opts.role === 'repo-agent' || opts.streaming) {
    args.push('--json');
  }

  if (shouldDisableCodexMcp(opts, 'oneshot')) {
    for (const name of collectCodexMcpServerNames(opts.cwd)) {
      args.push('--config', `mcp_servers.${name}.enabled=false`);
    }
  }

  // Persona + appendSystemPrompt combined as --config developer_instructions.
  // role: 'allmind' defaults to the AllMind persona path; caller can override with opts.persona.
  // File content is read and passed as plain text (no XML wrapper).
  const persona = opts.persona || (opts.role === 'allmind' ? ALLMIND_PERSONA_PATH : null);
  let developerInstructions = '';
  if (persona) {
    developerInstructions += readFileSync(persona, 'utf8');
  }
  if (opts.appendSystemPrompt) {
    if (developerInstructions) developerInstructions += '\n\n';
    developerInstructions += opts.appendSystemPrompt;
  }
  if (developerInstructions) {
    args.push('--config', `developer_instructions=${developerInstructions}`);
  }

  // Unsupported features — warn and skip
  if (opts.maxTurns) warn('maxTurns is not supported by the codex backend and will be ignored');
  if (opts.allowedTools) warn('allowedTools is not supported by the codex backend; use opts.sandbox to restrict filesystem access');
  // mcpConfig / strictMcp — codex manages MCP via ~/.codex/config.toml; not applicable here

  // Prompt is positional, last
  args.push(opts.prompt);

  return args;
}

function warnMissingProvenance(opts, label) {
  const warn = (msg) => process.stderr.write(`mercenary: ${msg}\n`);
  if (!opts.purpose) warn(`${label}: no --purpose provided — consider setting purpose for traceability`);
  if (!opts.origin) warn(`${label}: no --origin provided — consider setting origin for traceability`);
}

// --- One-shot Mode ---

function run(opts = {}) {
  warnMissingProvenance(opts, 'run');
  return new Promise((resolve, reject) => {
    if (!opts.prompt) return reject(new Error('prompt is required'));

    const backend = opts.backend || 'claude';
    let binaryPath, spawnArgs, env, useStdinForPrompt = false;
    try {
      if (backend === 'codex') {
        binaryPath = resolveCodexPath();
        spawnArgs = ['exec', ...buildCodexArgs(opts)];
        env = sanitizeEnvCodex(opts);
        if (estimateArgLength(spawnArgs) > SAFE_CLI_CHARS || opts.prompt.includes('\n')) {
          spawnArgs = ['exec', ...buildCodexArgs({ ...opts, prompt: '-' })];
          useStdinForPrompt = true;
        }
      } else {
        binaryPath = resolveClaudePath();
        const claudeArgs = buildArgs(opts);
        spawnArgs = ['-p', ...claudeArgs, '--', opts.prompt];
        env = sanitizeEnv(opts);

        // If total CLI length exceeds safe threshold, pipe prompt via stdin instead
        if (estimateArgLength(spawnArgs) > SAFE_CLI_CHARS) {
          // Remove positional prompt and '--' separator from args
          spawnArgs = ['-p', ...claudeArgs];
          useStdinForPrompt = true;
        }
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
      stdio: [useStdinForPrompt ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env
    });
    proc.unref();

    if (useStdinForPrompt) {
      proc.stdin.on('error', () => {}); // Swallow EPIPE if process exits early
      proc.stdin.write(opts.prompt);
      proc.stdin.end();
    }

    try {
      ledgerRegister({ pid: proc.pid, backend, mode: 'oneshot', binaryPath, prompt: opts.prompt, cwd: opts.cwd || process.cwd(), purpose: opts.purpose, origin: opts.origin });
    } catch { /* ledger failure must not break spawning */ }

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
      try { ledgerMarkDead(proc.pid); } catch { /* ledger failure */ }
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
      try { ledgerMarkDead(proc.pid); } catch { /* ledger failure */ }
      reject(new Error(`Failed to spawn ${backend} process at ${binaryPath}: ${err.message}. Common causes: binary not found (ENOENT), permission denied (EACCES), or missing system DLL. Check that the CLI binary exists and is executable.`));
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

  // Role-based presets for codex interactive sessions.
  // role: 'coordinator' → supervised session; codex default approval_policy is on-request
  //                        (pauses for human approval before each action) which is exactly right.
  //                        Apply workspace-write sandbox as a sensible safety boundary.
  // role: 'allmind'     → persona injection (handled below) + pragmatic personality.
  const sandbox = getDefaultCodexSandbox(opts, 'interactive');
  if (sandbox) codexArgs.push(`--sandbox "${sandbox}"`);
  if (shouldDisableCodexMcp(opts, 'interactive')) {
    for (const name of collectCodexMcpServerNames(opts.cwd)) {
      codexArgs.push('--config', `mcp_servers.${name}.enabled=false`);
    }
  }
  if (opts.role === 'allmind') codexArgs.push('--config', 'personality=pragmatic');

  // Persona + appendSystemPrompt as developer_instructions (write to temp file)
  const sessionPersona = opts.persona || (opts.role === 'allmind' ? ALLMIND_PERSONA_PATH : null);
  let developerInstructions = '';
  if (sessionPersona) {
    developerInstructions += readFileSync(sessionPersona, 'utf8');
  }
  if (opts.appendSystemPrompt) {
    if (developerInstructions) developerInstructions += '\n\n';
    developerInstructions += opts.appendSystemPrompt;
  }
  if (developerInstructions) {
    const instrFile = join(tmpBase, 'developer-instructions.txt');
    writeFileSync(instrFile, developerInstructions, 'utf8');
    lines.push(`$diContent = Get-Content "${instrFile}" -Raw`);
    lines.push('Write-Host "[mercenary] Developer instructions: $($diContent.Length) chars" -ForegroundColor DarkGray');
    codexArgs.push('--config "developer_instructions=$diContent"');
  }

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
  try {
    ledgerRegister({ pid: proc.pid, backend: 'codex', mode: 'interactive', binaryPath: codexPath, cwd: opts.cwd, purpose: opts.purpose, origin: opts.origin });
  } catch { /* ledger failure must not break spawning */ }

  return { pid: proc.pid, title, launcherPath };
}

async function openSession(opts = {}) {
  warnMissingProvenance(opts, 'openSession');
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
    // Expose dispatch_id so the spawned session can include it in events
    ...(opts.dispatchId ? [`$env:ALLMIND_DISPATCH_ID = "${opts.dispatchId.replace(/"/g, '')}"`] : []),
    // Route through local LiteLLM proxy when caller opts in
    ...(opts.useLocalModel ? [`$env:ANTHROPIC_BASE_URL = "${(opts.localModelUrl || 'http://127.0.0.1:4000').replace(/"/g, '`"')}"`] : []),
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

  // Exit hook — phone home to AllMind with exit code so dead sessions are detected.
  // The dispatch_id is baked in at generation time; if not provided, skip the hook.
  if (opts.dispatchId) {
    const safeDispatchId = opts.dispatchId.replace(/"/g, '');
    lines.push('');
    lines.push('# Exit hook — report session exit to AllMind');
    lines.push('try {');
    lines.push(`  $exitBody = '{"event_type":"mercenary_session_exit","summary":"Session exited with code ' + $LASTEXITCODE + '","details":{"dispatch_id":"${safeDispatchId}","exit_code":' + $LASTEXITCODE + '}}'`);
    lines.push('  curl.exe -s -X POST http://localhost:7780/api/internal/event -H "Content-Type: application/json" -d $exitBody | Out-Null');
    lines.push('  Write-Host "[mercenary] Exit hook sent (code $LASTEXITCODE)" -ForegroundColor DarkGray');
    lines.push('} catch {');
    lines.push('  Write-Host "[mercenary] Exit hook failed: $_" -ForegroundColor DarkGray');
    lines.push('}');
  }

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
  try {
    ledgerRegister({ pid: proc.pid, backend: 'claude', mode: 'interactive', binaryPath: claudePath, cwd: opts.cwd, purpose: opts.purpose, origin: opts.origin });
  } catch { /* ledger failure must not break spawning */ }

  return { pid: proc.pid, title, launcherPath };
}

// --- Headless Persistent Session Mode ---

/**
 * Open a headless persistent Claude session with stdio pipes.
 * Unlike openSession() (visible terminal) or run() (one-shot with -p),
 * this spawns Claude in conversational mode with --output-format stream-json
 * and communicates via stdin/stdout pipes. No visible window.
 *
 * Returns a session handle: { send(message), close(), pid, closed, turnCount }
 *
 * @param {Object} opts
 * @param {string} opts.role - Role preset (e.g. 'core')
 * @param {string} [opts.cwd] - Working directory
 * @param {string} [opts.systemPrompt] - System prompt content (string, not file path)
 * @param {string} [opts.appendSystemPrompt] - Additional system prompt
 * @param {string} [opts.persona] - Persona file path
 * @param {string} [opts.model] - Model to use
 * @param {number} [opts.maxTokens] - Max output tokens
 * @returns {Promise<{send: Function, close: Function, pid: number, closed: boolean, turnCount: number}>}
 */
async function openHeadlessSession(opts = {}) {
  warnMissingProvenance(opts, 'openHeadlessSession');
  const claudePath = resolveClaudePath();
  const env = sanitizeEnv(opts);

  const args = ['--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];

  // System prompt
  if (opts.systemPrompt) {
    args.push('--system-prompt', opts.systemPrompt);
  }

  // Model selection
  if (opts.model) {
    args.push('--model', opts.model);
  }

  // Persona + append-system-prompt (reuse existing pattern from buildArgs)
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
    if (appendSystemPrompt.length > 8000) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mercenary-headless-'));
      const promptFile = join(tmpDir, 'append-system-prompt.txt');
      writeFileSync(promptFile, appendSystemPrompt, 'utf8');
      args.push('--append-system-prompt-file', promptFile);
    } else {
      args.push('--append-system-prompt', appendSystemPrompt);
    }
  }

  // MCP config — headless Core sessions use strict MCP to block project .mcp.json
  if (opts.strictMcp !== false) {
    args.push('--strict-mcp-config');
  }
  if (opts.mcpConfig) {
    args.push('--mcp-config', opts.mcpConfig);
  }

  const proc = spawn(claudePath, args, {
    cwd: opts.cwd || process.cwd(),
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });

  // Debug: log stderr from headless session
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`[headless-session pid=${proc.pid}] stderr: ${text.substring(0, 500)}`);
  });

  try {
    ledgerRegister({
      pid: proc.pid,
      backend: 'claude',
      mode: 'headless-session',
      binaryPath: claudePath,
      prompt: '[headless session]',
      cwd: opts.cwd || process.cwd(),
      purpose: opts.purpose,
      origin: opts.origin,
    });
  } catch { /* ledger failure must not break spawning */ }

  let closed = false;
  let turnCount = 0;
  let lineBuffer = '';
  let currentResolve = null;
  let currentReject = null;
  let currentTextContent = '';

  // Process stdout line by line for stream-json output
  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        _handleStreamEvent(data);
      } catch {
        // Non-JSON line — ignore (verbose output)
      }
    }
  });

  function _handleStreamEvent(data) {
    if (data.type === 'assistant') {
      // Accumulate text content from assistant message
      const content = data.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            currentTextContent = block.text || '';
          }
        }
      }
    } else if (data.type === 'result') {
      // Turn complete — resolve the pending send() promise
      if (currentResolve) {
        const resolve = currentResolve;
        currentResolve = null;
        currentReject = null;

        // Try to parse response as JSON from the accumulated text
        let parsed;
        try {
          // Extract JSON block from text (may be wrapped in markdown code fence)
          const jsonMatch = currentTextContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                            currentTextContent.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
          } else {
            parsed = { action: 'answer', reasoning: currentTextContent };
          }
        } catch {
          parsed = { action: 'answer', reasoning: currentTextContent };
        }

        currentTextContent = '';
        resolve(parsed);
      }
    }
  }

  // Handle process crash
  proc.on('close', (exitCode) => {
    closed = true;
    try { ledgerMarkDead(proc.pid); } catch { /* ledger failure */ }
    if (currentReject) {
      const reject = currentReject;
      currentResolve = null;
      currentReject = null;
      reject(new Error(`Headless session process exited unexpectedly (exit code ${exitCode}). The session was active but the Claude CLI process died mid-turn. Exit code 1 = general error, 124 = timeout, 137 = killed (OOM or external signal). Check pm2 logs for allmind or the agent's log file in data/logs/agents/.`));
    }
  });

  proc.on('error', (err) => {
    closed = true;
    try { ledgerMarkDead(proc.pid); } catch { /* ledger failure */ }
    if (currentReject) {
      const reject = currentReject;
      currentResolve = null;
      currentReject = null;
      reject(err);
    }
  });

  // Claude Code 2.1.88+ treats stream-json + pipe stdin as print mode:
  // expects stdin data within 3s or errors with "Input must be provided".
  // Write the initial prompt to stdin immediately so Claude gets input in time.
  // If no initialPrompt, write a minimal message to satisfy the stdin check.
  const firstMessage = opts.initialPrompt || 'ready';
  proc.stdin.write(firstMessage + '\n');

  // Wait for initial system message AND first turn response
  const initResponse = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Headless session startup timed out (30s). The Claude CLI process was spawned but never produced a system init message. Common causes: ANTHROPIC_API_KEY expired or missing (check data/.env), slow MCP server initialization, or Claude CLI hanging on auth. Check pm2 logs for allmind.'));
    }, 30000);

    // We need to wait for the first result (response to initialPrompt).
    // The _handleStreamEvent function resolves currentResolve on 'result' type.

    // Set up to resolve when the first turn completes
    currentResolve = (parsed) => {
      clearTimeout(timeout);
      currentResolve = null;
      currentReject = null;
      turnCount++;
      resolve(parsed);
    };
    currentReject = (err) => {
      clearTimeout(timeout);
      reject(err);
    };

    proc.on('close', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Headless session process exited before ready (exit code ${code}). The Claude CLI started but died before producing a system message. Common causes: ANTHROPIC_API_KEY expired or missing (check data/.env), Claude CLI auth failure (run 'claude auth status'), or MCP server config error blocking startup. Check pm2 logs for allmind.`));
    });
  });

  return {
    /** Response from the initial prompt (if provided) */
    initResponse,

    /**
     * Send a message to the headless session and await the response.
     * @param {string} message - The message to send
     * @returns {Promise<Object>} Parsed JSON response from Claude
     */
    send: (message) => {
      if (closed) return Promise.reject(new Error('Session is closed'));

      return new Promise((resolve, reject) => {
        currentResolve = resolve;
        currentReject = reject;
        currentTextContent = '';
        turnCount++;

        // Write message to stdin followed by newline
        proc.stdin.write(message + '\n');
      });
    },

    /**
     * Close the headless session.
     */
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        proc.stdin.end();
        // Give it 5s to exit gracefully, then force kill
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            treeKill(proc.pid);
            resolve();
          }, 5000);
          proc.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch {
        treeKill(proc.pid);
      }
      try { ledgerMarkDead(proc.pid); } catch { /* ledger failure */ }
    },

    get closed() { return closed; },
    get turnCount() { return turnCount; },
    get pid() { return proc.pid; },
  };
}

// --- CLI Argument Parser ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  const positional = [];
  const booleanFlags = new Set(['--json', '--am', '--interactive', '--ps', '--audit', '--purge']);
  const valueFlags = new Set([
    '--prompt', '--timeout', '--allowed-tools', '--max-tokens',
    '--persona', '--model', '--output-format', '--append-system-prompt',
    '--max-turns', '--cwd', '--system-prompt', '--title', '--kill',
    '--backend', '--session-id', '--resume', '--purpose', '--origin'
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

  // --ps mode: show ledger status (with fresh audit)
  if (opts.ps) {
    console.log(ledgerStatus());
    return;
  }

  // --audit mode: run audit and display results
  if (opts.audit) {
    ledgerAudit();
    console.log(ledgerStatus());
    return;
  }

  // --purge mode: kill all tracked processes, monitor, report
  if (opts.purge) {
    await ledgerPurge();
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
      purpose: opts.purpose,
      origin: opts.origin,
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
      resume: opts.resume,
      sessionId: opts.sessionId,
      purpose: opts.purpose,
      origin: opts.origin,
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
  console.error('       mercenary --ps              Show all tracked processes with status and memory');
  console.error('       mercenary --audit           Scan, discover orphans, update ledger metrics');
  console.error('       mercenary --purge           Kill all tracked processes, monitor 3 min, report');
  process.exit(1);
}

// Run CLI if this file is the entry point
if (resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(`mercenary: ${err.message}`);
    process.exit(1);
  });
}

export {
  run, openSession, openHeadlessSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex, buildCodexArgs, parseArgs,
  ledgerRegister, ledgerMarkDead, ledgerAudit, ledgerStatus, ledgerPurge,
  checkPidAlive, discoverProcesses, readLedger, writeLedger, LEDGER_PATH,
};
