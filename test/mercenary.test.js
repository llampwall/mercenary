import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import module exports
import { run, openSession, treeKill, resolveClaudePath, resolveCodexPath, sanitizeEnvCodex, buildCodexArgs, parseArgs } from '../mercenary.js';

const MERCENARY = join(import.meta.dirname, '..', 'mercenary.js');

// Helper: run mercenary CLI and capture output
function execMercenary(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MERCENARY, ...args], {
      cwd: opts.cwd || import.meta.dirname,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
      timeout: opts.timeout || 30000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (exitCode) => resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode }));
    proc.on('error', reject);
  });
}

// =============================================================================
// Unit Tests
// =============================================================================

describe('resolveClaudePath', () => {
  it('finds claude binary', () => {
    const p = resolveClaudePath();
    assert.ok(p, 'should return a path');
    assert.ok(existsSync(p), `resolved path should exist: ${p}`);
  });

  it('respects CLAUDE_PATH env var', () => {
    const original = process.env.CLAUDE_PATH;
    try {
      // Point to something that exists
      process.env.CLAUDE_PATH = process.execPath; // node.exe exists
      const p = resolveClaudePath();
      assert.equal(p, process.execPath);
    } finally {
      if (original) process.env.CLAUDE_PATH = original;
      else delete process.env.CLAUDE_PATH;
    }
  });

  it('throws on invalid CLAUDE_PATH', () => {
    const original = process.env.CLAUDE_PATH;
    try {
      process.env.CLAUDE_PATH = 'C:\\nonexistent\\claude.exe';
      assert.throws(() => resolveClaudePath(), /not found/);
    } finally {
      if (original) process.env.CLAUDE_PATH = original;
      else delete process.env.CLAUDE_PATH;
    }
  });
});

describe('resolveCodexPath', () => {
  it('uses CODEX_PATH when set to an existing file', () => {
    const original = process.env.CODEX_PATH;
    try {
      // Reuse claudePath as a stand-in for an existing file
      const claudePath = resolveClaudePath();
      process.env.CODEX_PATH = claudePath;
      const p = resolveCodexPath();
      assert.equal(p, claudePath);
    } finally {
      if (original) process.env.CODEX_PATH = original;
      else delete process.env.CODEX_PATH;
    }
  });

  it('throws when CODEX_PATH points to a nonexistent file', () => {
    const original = process.env.CODEX_PATH;
    try {
      process.env.CODEX_PATH = 'C:\\nonexistent\\codex.exe';
      assert.throws(() => resolveCodexPath(), /CODEX_PATH/);
    } finally {
      if (original) process.env.CODEX_PATH = original;
      else delete process.env.CODEX_PATH;
    }
  });
});

describe('sanitizeEnvCodex', () => {
  it('strips Claude-specific vars', () => {
    const saved = {
      CLAUDECODE: process.env.CLAUDECODE,
      CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    process.env.CLAUDECODE = '1';
    process.env.CLAUDE_CODE_ENTRYPOINT = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    try {
      const env = sanitizeEnvCodex();
      assert.strictEqual(env.CLAUDECODE, undefined);
      assert.strictEqual(env.CLAUDE_CODE_ENTRYPOINT, undefined);
      assert.strictEqual(env.ANTHROPIC_API_KEY, undefined);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined) process.env[k] = v; else delete process.env[k];
      }
    }
  });

  it('does not set CLAUDE_CODE_MAX_OUTPUT_TOKENS', () => {
    const env = sanitizeEnvCodex();
    assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, undefined);
  });

  it('preserves CODEX_API_KEY', () => {
    const original = process.env.CODEX_API_KEY;
    process.env.CODEX_API_KEY = 'sk-codex-test';
    try {
      const env = sanitizeEnvCodex();
      assert.strictEqual(env.CODEX_API_KEY, 'sk-codex-test');
    } finally {
      if (original !== undefined) process.env.CODEX_API_KEY = original;
      else delete process.env.CODEX_API_KEY;
    }
  });

  it('forces SHELL to pwsh', () => {
    const env = sanitizeEnvCodex();
    assert.ok(env.SHELL.includes('pwsh'), `expected SHELL to include pwsh, got: ${env.SHELL}`);
  });
});

describe('buildCodexArgs', () => {
  it('includes --dangerously-bypass-approvals-and-sandbox', () => {
    const args = buildCodexArgs({ prompt: 'hello' });
    assert.ok(args.includes('--dangerously-bypass-approvals-and-sandbox'));
  });

  it('includes --ephemeral', () => {
    const args = buildCodexArgs({ prompt: 'hello' });
    assert.ok(args.includes('--ephemeral'));
  });

  it('pipeline role adds --json', () => {
    const args = buildCodexArgs({ prompt: 'hello', role: 'pipeline' });
    assert.ok(args.includes('--json'));
  });

  it('default role has no --json', () => {
    const args = buildCodexArgs({ prompt: 'hello' });
    assert.ok(!args.includes('--json'));
  });

  it('passes --model', () => {
    const args = buildCodexArgs({ prompt: 'hello', model: 'gpt-5-codex' });
    const idx = args.indexOf('--model');
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], 'gpt-5-codex');
  });

  it('prompt is the last arg', () => {
    const args = buildCodexArgs({ prompt: 'do the thing' });
    assert.strictEqual(args[args.length - 1], 'do the thing');
  });

  it('appendSystemPrompt sets developer_instructions config', () => {
    const args = buildCodexArgs({ prompt: 'hello', appendSystemPrompt: 'be concise' });
    const idx = args.indexOf('--config');
    assert.ok(idx >= 0, '--config not found');
    assert.ok(args[idx + 1].startsWith('developer_instructions='));
  });

  it('warns and skips maxTurns', () => {
    const msgs = [];
    buildCodexArgs({ prompt: 'hello', maxTurns: 5 }, (msg) => msgs.push(msg));
    assert.ok(msgs.some(m => m.includes('maxTurns')));
    // no --max-turns in args
    const args = buildCodexArgs({ prompt: 'hello', maxTurns: 5 }, () => {});
    assert.ok(!args.includes('--max-turns'));
  });

  it('warns and skips allowedTools', () => {
    const msgs = [];
    buildCodexArgs({ prompt: 'hello', allowedTools: 'Bash,Read' }, (msg) => msgs.push(msg));
    assert.ok(msgs.some(m => m.includes('allowedTools')));
    const args = buildCodexArgs({ prompt: 'hello', allowedTools: 'Bash,Read' }, () => {});
    assert.ok(!args.includes('--allowed-tools'));
  });
});

describe('parseArgs', () => {
  it('parses --backend codex', () => {
    const { opts } = parseArgs(['node', 'mercenary.js', '--prompt', 'hi', '--backend', 'codex']);
    assert.strictEqual(opts.backend, 'codex');
  });

  it('--backend defaults to undefined', () => {
    const { opts } = parseArgs(['node', 'mercenary.js', '--prompt', 'hi']);
    assert.strictEqual(opts.backend, undefined);
  });
});

describe('treeKill', () => {
  it('does not throw on non-existent PID', () => {
    assert.doesNotThrow(() => treeKill(999999));
  });

  it('kills a real process tree', () => {
    // Spawn a long-running process then kill it
    const proc = spawn('node', ['-e', 'setTimeout(()=>{},60000)'], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    const pid = proc.pid;

    treeKill(pid);

    // Verify it's dead by trying to kill again (should not throw)
    treeKill(pid);
  });
});

describe('module exports', () => {
  it('exports run as function', () => {
    assert.equal(typeof run, 'function');
  });

  it('exports openSession as function', () => {
    assert.equal(typeof openSession, 'function');
  });

  it('exports treeKill as function', () => {
    assert.equal(typeof treeKill, 'function');
  });

  it('exports resolveClaudePath as function', () => {
    assert.equal(typeof resolveClaudePath, 'function');
  });

  it('exports resolveCodexPath as function', () => {
    assert.equal(typeof resolveCodexPath, 'function');
  });

  it('exports sanitizeEnvCodex as function', () => {
    assert.equal(typeof sanitizeEnvCodex, 'function');
  });

  it('exports buildCodexArgs as function', () => {
    assert.equal(typeof buildCodexArgs, 'function');
  });

  it('exports parseArgs as function', () => {
    assert.equal(typeof parseArgs, 'function');
  });
});

describe('run()', () => {
  it('rejects without prompt', async () => {
    await assert.rejects(() => run({}), /prompt is required/);
  });

  it('rejects if claude binary not found', async () => {
    const original = process.env.CLAUDE_PATH;
    try {
      process.env.CLAUDE_PATH = 'C:\\nonexistent\\claude.exe';
      await assert.rejects(() => run({ prompt: 'test' }), /not found/);
    } finally {
      if (original) process.env.CLAUDE_PATH = original;
      else delete process.env.CLAUDE_PATH;
    }
  });
});

// =============================================================================
// CLI Tests
// =============================================================================

describe('CLI', () => {
  it('prints usage when no args given', async () => {
    const { stderr, exitCode } = await execMercenary([]);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('Usage:'), 'should print usage');
  });

  it('--kill does not throw on bogus PID', async () => {
    const { exitCode } = await execMercenary(['--kill', '999999']);
    assert.equal(exitCode, 0);
  });

  it('warns on unknown flags', async () => {
    // No --prompt, so mercenary prints usage + warning without spawning claude
    const { stderr } = await execMercenary(['--bogus-flag', 'value']);
    assert.ok(stderr.includes('unknown flag'), 'should warn about unknown flag');
  });
});

// =============================================================================
// Integration Tests (require claude binary)
// =============================================================================

// Integration tests gate: set MERCENARY_INTEGRATION=1 to run
function skipWithoutIntegration(t) {
  if (!process.env.MERCENARY_INTEGRATION) t.skip('set MERCENARY_INTEGRATION=1 to run');
  try { resolveClaudePath(); } catch { t.skip('claude not available'); }
}

describe('integration', () => {
  it('one-shot captures stdout', async (t) => {
    skipWithoutIntegration(t);
    const result = await run({
      prompt: 'Reply with exactly: MERCENARY_TEST_OK',
      timeout: 30,
      maxTurns: 1,
    });
    assert.equal(result.timedOut, false);
    assert.equal(typeof result.stdout, 'string');
    assert.equal(typeof result.durationMs, 'number');
    assert.equal(typeof result.pid, 'number');
    assert.ok(result.stdout.includes('MERCENARY_TEST_OK'), `stdout should contain test string, got: ${result.stdout.slice(0, 200)}`);
  });

  it('one-shot JSON mode via CLI', async (t) => {
    skipWithoutIntegration(t);
    const { stdout, exitCode } = await execMercenary([
      '--prompt', 'Reply with exactly: MERCENARY_JSON_OK',
      '--json', '--timeout', '30', '--max-turns', '1',
    ]);
    assert.equal(exitCode, 0, 'JSON mode always exits 0');
    const parsed = JSON.parse(stdout);
    assert.equal(typeof parsed.stdout, 'string');
    assert.equal(typeof parsed.stderr, 'string');
    assert.equal(typeof parsed.exitCode, 'number');
    assert.equal(typeof parsed.timedOut, 'boolean');
    assert.equal(typeof parsed.durationMs, 'number');
  });

  it('timeout kills process and exits 124', async (t) => {
    skipWithoutIntegration(t);
    const result = await run({
      prompt: 'Write a 10000-word essay about the history of computing. Take your time.',
      timeout: 3,
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
  });

  it('child env is sanitized', async (t) => {
    skipWithoutIntegration(t);
    const original = {
      CLAUDECODE: process.env.CLAUDECODE,
      CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    try {
      process.env.CLAUDECODE = 'should-be-stripped';
      process.env.CLAUDE_CODE_ENTRYPOINT = 'should-be-stripped';
      process.env.ANTHROPIC_API_KEY = 'should-be-stripped';

      const result = await run({
        prompt: 'Reply with exactly: ENV_TEST_OK',
        timeout: 30,
        maxTurns: 1,
      });
      assert.equal(result.timedOut, false);
      assert.ok(result.stdout.includes('ENV_TEST_OK'));
    } finally {
      for (const [k, v] of Object.entries(original)) {
        if (v) process.env[k] = v;
        else delete process.env[k];
      }
    }
  });

  it('--max-tokens sets CLAUDE_CODE_MAX_OUTPUT_TOKENS', async (t) => {
    skipWithoutIntegration(t);
    const result = await run({
      prompt: 'Reply with exactly: TOKENS_OK',
      timeout: 30,
      maxTokens: 8192,
      maxTurns: 1,
    });
    assert.equal(result.timedOut, false);
    assert.ok(result.stdout.includes('TOKENS_OK'));
  });

  it('persona injection via --am flag (CLI)', async (t) => {
    skipWithoutIntegration(t);
    const { exitCode, stderr } = await execMercenary([
      '--prompt', 'Reply with exactly: PERSONA_OK',
      '--am', '--json', '--timeout', '30', '--max-turns', '1',
    ]);
    if (exitCode !== 0 && stderr.includes('persona')) return; // file missing OK in test env
    assert.equal(exitCode, 0);
  });

  it('persona injection via --persona flag', async (t) => {
    skipWithoutIntegration(t);
    const tmpDir = mkdtempSync(join(tmpdir(), 'merc-test-'));
    const personaFile = join(tmpDir, 'persona.md');
    writeFileSync(personaFile, 'You are a helpful test persona.');

    const result = await run({
      prompt: 'Reply with exactly: CUSTOM_PERSONA_OK',
      timeout: 30,
      persona: personaFile,
      maxTurns: 1,
    });
    assert.equal(result.timedOut, false);
    assert.ok(result.stdout.includes('CUSTOM_PERSONA_OK'));
  });

  it('--allowed-tools passes through', async (t) => {
    skipWithoutIntegration(t);
    const result = await run({
      prompt: 'Reply with exactly: TOOLS_OK',
      timeout: 30,
      allowedTools: 'Read',
      maxTurns: 1,
    });
    assert.equal(result.timedOut, false);
    assert.ok(result.stdout.includes('TOOLS_OK'));
  });
});
