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
    expect(dashboard.body).toContain('Mission control');
    expect(dashboard.body).toContain('Agents radar');
    expect(dashboard.body).toContain('AI Credit Saver');
    expect(dashboard.body).toContain('data-pages');
    expect(dashboard.body).toContain('id="pageTitle"');
    expect(dashboard.body).toContain('id="settingsPanel"');
    expect(dashboard.body).toContain('id="securityPanel"');
    expect(dashboard.body).toContain('id="nodeServersPanel"');
    expect(dashboard.body).toContain('id="updateCenterPanel"');
    expect(dashboard.body).toContain('id="nodeConfirmModal"');
    expect(dashboard.body).toContain('Force Kill locked');
    expect(dashboard.body).toContain('function connectLive()');
    const codinfy = await app.inject('/codinfy');
    expect(codinfy.statusCode).toBe(200);
    expect(codinfy.body).toContain('Codinfy Agent Monitor');
    const officialRoute = await app.inject('/codinfy-agent-monitor');
    expect(officialRoute.statusCode).toBe(200);
    const agents = await app.inject('/agents');
    expect(agents.statusCode).toBe(200);
    const review = await app.inject('/api/review');
    expect(review.statusCode).toBe(200);
    expect(review.json()).toHaveProperty('ready');
    const git = await app.inject('/api/git');
    expect(git.statusCode).toBe(200);
    const pages = [
      'dashboard',
      'agents',
      'workflow',
      'tasks',
      'context',
      'limits',
      'models',
      'budget',
      'timeline',
      'files',
      'git',
      'tests',
      'build',
      'environment',
      'health',
      'security',
      'performance',
      'reports',
      'node-servers',
      'port-conflicts',
      'process-map',
      'resource-guard',
      'update-center',
      'release-notes',
      'backup-restore',
      'doctor',
      'recovery',
      'notifications',
      'settings',
      'about',
    ];
    for (const page of pages) expect((await app.inject(`/${page}`)).statusCode).toBe(200);
    const apis = [
      'status',
      'environment',
      'git',
      'agents',
      'timeline',
      'review',
      'tasks',
      'files',
      'observer',
      'dependencies',
      'reports',
      'settings',
      'checks',
      'history',
    ];
    for (const api of apis) expect((await app.inject(`/api/${api}`)).statusCode).toBe(200);
    const nodeServers = await app.inject('/api/node-servers');
    expect(nodeServers.statusCode).toBe(200);
    expect(nodeServers.json()).toHaveProperty('totals');
    const updatePreflight = await app.inject('/api/update/preflight');
    expect(updatePreflight.statusCode).toBe(200);
    expect(updatePreflight.json()).toHaveProperty('requiresConfirmation', true);
    const rejectedStop = await app.inject({
      method: 'POST',
      url: '/api/node-processes/1/stop',
      payload: { confirm: true },
    });
    expect(rejectedStop.statusCode).toBe(403);
    const rejectedMutation = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { language: 'fr', level: 'expert', safeGuard: true },
    });
    expect(rejectedMutation.statusCode).toBe(403);
    const savedSettings = await app.inject({
      method: 'POST',
      url: '/api/settings',
      headers: { origin: 'http://127.0.0.1', host: '127.0.0.1' },
      payload: { language: 'fr', level: 'expert', safeGuard: true },
    });
    expect(savedSettings.statusCode).toBe(200);
    expect(savedSettings.json()).toMatchObject({ language: 'fr', level: 'expert' });
    const reportExport = await app.inject({
      method: 'POST',
      url: '/api/reports/export',
      headers: { origin: 'http://127.0.0.1', host: '127.0.0.1' },
      payload: { format: 'json' },
    });
    expect(reportExport.statusCode).toBe(200);
    expect(reportExport.json().name).toMatch(/\.json$/);
    const rebound = await app.inject({ url: '/api/status', headers: { host: 'attacker.invalid' } });
    expect(rebound.statusCode).toBe(403);
    expect(dashboard.headers['x-frame-options']).toBe('DENY');
    await app.close();
    monitor.close();
    rmSync(root, { recursive: true, force: true });
  }, 60_000);
});
