import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  categoryForScore,
  checkAttribution,
  getModelAdvice,
  redactSecrets,
  renderMarkdownReport,
  scanSecrets,
} from '../src/index.js';

const roots: string[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'codinfy-monitor-'));
  roots.push(path);
  return path;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Codinfy Agent Monitor core', () => {
  it('creates a local session and storage structure', () => {
    const monitor = new AgentMonitor(root());
    const event = monitor.startSession('Test session', 'Vitest');
    expect(event.type).toBe('session.started');
    expect(monitor.store.getConfig().sessionName).toBe('Test session');
    expect(monitor.store.databasePath).toContain('metrics.sqlite');
    monitor.close();
  });

  it('creates and updates agents', () => {
    const monitor = new AgentMonitor(root());
    const agent = monitor.registerAgent({
      name: 'Security Agent',
      role: 'security',
      status: 'active',
    });
    const updated = monitor.updateAgent(agent.id, {
      status: 'blocked',
      lastAction: 'Waiting for approval',
    });
    expect(updated.status).toBe('blocked');
    expect(updated.lastAction).toBe('Waiting for approval');
    monitor.close();
  });

  it('creates tasks and calculates workflow progress', () => {
    const monitor = new AgentMonitor(root());
    const first = monitor.createTask({ title: 'Core', status: 'in_progress', progress: 50 });
    monitor.createTask({ title: 'Docs', status: 'completed', progress: 100 });
    expect(monitor.snapshot().workflowProgress).toBe(75);
    expect(monitor.updateTask(first.id, { status: 'completed' }).progress).toBe(100);
    monitor.close();
  });

  it('records context, daily, and weekly metrics with provenance', () => {
    const monitor = new AgentMonitor(root());
    monitor.setMetric('context', 68, 'official');
    monitor.setMetric('daily', 81, 'estimated');
    monitor.setMetric('weekly', 42, 'estimated');
    const metrics = monitor.store.getMetrics();
    expect(metrics.context).toMatchObject({ value: 68, source: 'official' });
    expect(metrics.daily.value).toBe(81);
    expect(metrics.weekly.value).toBe(42);
    monitor.close();
  });

  it('maps Model Need Scores to configurable categories', () => {
    expect(categoryForScore(20)).toBe('fast_cheap');
    expect(categoryForScore(50)).toBe('standard_code');
    expect(categoryForScore(70)).toBe('advanced_code');
    expect(categoryForScore(90)).toBe('premium_reasoning');
  });

  it('recommends economical models for simple documentation', () => {
    const advice = getModelAdvice({
      task: 'small README documentation correction',
      currentCategory: 'premium_reasoning',
      risk: 'low',
    });
    expect(advice.recommendedCategory).toBe('fast_cheap');
    expect(advice.estimatedCostSavingPercent).toBeGreaterThan(0);
    expect(advice.requiresConfirmation).toBe(true);
  });

  it('recommends stronger reasoning for high-risk security work', () => {
    const advice = getModelAdvice({
      task: 'security audit and auth architecture',
      risk: 'high',
      sensitiveFiles: 3,
    });
    expect(advice.score).toBeGreaterThanOrEqual(81);
    expect(advice.recommendedCategory).toBe('premium_reasoning');
  });

  it('redacts keys without returning their values', () => {
    const secret = `ghp_${'a'.repeat(30)}`;
    expect(redactSecrets(`token=${secret}`)).toBe('token=[REDACTED]');
  });

  it('detects secret files and returns redacted findings', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    writeFileSync(join(project, '.env'), `ACCESS_TOKEN=${'x'.repeat(30)}\n`, 'utf8');
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === '.env')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain('x'.repeat(30));
  });

  it('exports a report containing the command, MCP, and signature', () => {
    const monitor = new AgentMonitor(root());
    const report = renderMarkdownReport(monitor.snapshot());
    expect(report).toContain('/codinfy');
    expect(report).toContain('codinfy-agent-monitor');
    expect(report).toContain(CODINFY_ATTRIBUTION.signature);
    monitor.close();
  });

  it('finds no missing mandatory attribution in the repository root', () => {
    expect(checkAttribution(process.cwd())).toEqual({});
  });
});
