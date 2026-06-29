import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  it('renders status with official command, MCP, and signature', () => {
    const project = mkdtempSync(join(tmpdir(), 'codinfy-cli-'));
    const binary = resolve('packages/cli/dist/index.js');
    const run = spawnSync(process.execPath, [binary, '-C', project, 'status'], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Codinfy Agent Monitor');
    expect(run.stdout).toContain('/codinfy');
    expect(run.stdout).toContain('codinfy-agent-monitor');
    expect(run.stdout).toContain('© CODINFY PLATFORMS SASU');
    rmSync(project, { recursive: true, force: true });
  }, 60_000);

  it('applies the global project option to mutating commands', () => {
    const project = mkdtempSync(join(tmpdir(), 'codinfy-cli-project-'));
    const binary = resolve('packages/cli/dist/index.js');
    const run = spawnSync(process.execPath, [binary, '-C', project, 'language', 'fr'], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(existsSync(join(project, '.codinfy-agent-monitor', 'config.json'))).toBe(true);
    rmSync(project, { recursive: true, force: true });
  }, 60_000);
});
