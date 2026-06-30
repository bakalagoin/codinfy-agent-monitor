import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
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

  it('records safe Claude Code, Codex, and Windsurf events through a trusted external CLI', () => {
    const project = mkdtempSync(join(tmpdir(), 'codinfy-hook-project-'));
    const trusted = mkdtempSync(join(tmpdir(), 'codinfy trusted bin-'));
    const marker = join(trusted, 'hook-args.txt');
    const binary = join(
      trusted,
      process.platform === 'win32' ? 'codinfy-agent-monitor.cmd' : 'codinfy-agent-monitor',
    );
    if (process.platform === 'win32') {
      writeFileSync(binary, `@echo off\r\n> "${marker}" echo %*\r\n`, 'utf8');
    } else {
      writeFileSync(binary, `#!/bin/sh\nprintf '%s' "$*" > "${marker}"\n`, 'utf8');
      chmodSync(binary, 0o755);
    }
    const wrappers = [
      {
        path: 'templates/claude-code/.claude/hooks/codinfy-agent-monitor.js',
        event: 'SessionStart',
        host: 'claude',
      },
      {
        path: 'templates/codex/.codex/hooks/codinfy-agent-monitor.js',
        event: 'PostToolUse',
        host: 'codex',
      },
      {
        path: 'templates/windsurf/.windsurf/hooks/codinfy-agent-monitor.js',
        event: 'post_write_code',
        host: 'windsurf',
      },
    ];
    for (const wrapper of wrappers) {
      const run = spawnSync(
        process.execPath,
        [resolve(wrapper.path), wrapper.event, wrapper.host],
        {
          cwd: project,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: [trusted, process.env.PATH].filter(Boolean).join(delimiter),
            PATHEXT: '.COM;.EXE;.BAT;.CMD',
          },
          timeout: 15_000,
        },
      );
      expect(run.status).toBe(0);
      const recorded = readFileSync(marker, 'utf8').replace(/"/g, '').replace(/\s+/g, ' ').trim();
      expect(recorded).toContain(`adapter-event ${wrapper.host} ${wrapper.event}`);
    }
    rmSync(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(trusted, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }, 20_000);

  it('ships host hook activation files for Claude Code, Codex, and Windsurf', () => {
    const claude = JSON.parse(
      readFileSync(resolve('templates/claude-code/.claude/settings.json'), 'utf8'),
    ) as { hooks: Record<string, unknown> };
    const codex = JSON.parse(
      readFileSync(resolve('templates/codex/.codex/hooks.json'), 'utf8'),
    ) as {
      hooks: Record<string, unknown>;
    };
    const windsurf = JSON.parse(
      readFileSync(resolve('templates/windsurf/.windsurf/hooks.json'), 'utf8'),
    ) as { hooks: Record<string, unknown> };
    expect(claude.hooks).toHaveProperty('PostToolUse');
    expect(codex.hooks).toHaveProperty('PostToolUse');
    expect(windsurf.hooks).toHaveProperty('post_write_code');
  });
});
