import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentMonitor } from '@codinfy/agent-monitor-core';
import { createLocalServer } from '../src/index.js';

describe('local dashboard server', () => {
  it('serves health, status, dashboard, and Codinfy attribution', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codinfy-server-'));
    const monitor = new AgentMonitor(root);
    const app = await createLocalServer(monitor);
    const health = await app.inject('/healthz');
    expect(health.statusCode).toBe(200);
    expect(health.json().name).toBe('codinfy-agent-monitor');
    const dashboard = await app.inject('/dashboard');
    expect(dashboard.body).toContain('© CODINFY PLATFORMS SASU');
    expect(dashboard.body).toContain('/codinfy');
    const review = await app.inject('/api/review');
    expect(review.statusCode).toBe(200);
    expect(review.json()).toHaveProperty('ready');
    const git = await app.inject('/api/git');
    expect(git.statusCode).toBe(200);
    await app.close();
    monitor.close();
    rmSync(root, { recursive: true, force: true });
  }, 15_000);
});
