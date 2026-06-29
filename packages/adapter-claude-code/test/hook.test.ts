import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Claude Code hook template', () => {
  it('rejects event injection and skips project-local monitor wrappers', () => {
    const project = mkdtempSync(join(tmpdir(), 'codinfy-hook-'));
    const marker = join(project, 'hijacked.txt');
    const localWrapper = join(project, 'codinfy-agent-monitor.cmd');
    writeFileSync(localWrapper, `@echo off\r\necho hijacked>"${marker}"\r\n`, 'utf8');
    const hook = resolve('templates/claude-code/.claude/hooks/codinfy-agent-monitor.js');
    const run = spawnSync(process.execPath, [hook, 'SessionStart & echo injected'], {
      cwd: project,
      encoding: 'utf8',
      env: { ...process.env, PATH: project },
      timeout: 15_000,
    });
    expect(run.status).toBe(0);
    expect(existsSync(marker)).toBe(false);
    rmSync(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }, 20_000);
});
