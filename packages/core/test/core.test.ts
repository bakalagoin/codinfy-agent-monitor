import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  analyzeObserver,
  categoryForScore,
  checkAttribution,
  detectDangerousCommand,
  getGitSummary,
  getModelAdvice,
  redactSecrets,
  renderHtmlReport,
  renderJsonReport,
  renderMarkdownReport,
  sanitizeTerminalText,
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

  it('neutralizes terminal control and bidi override characters', () => {
    const value = `safe\u001b]0;spoof\u0007\u202Etxt`;
    const sanitized = sanitizeTerminalText(value);
    expect(sanitized).not.toContain('\u001b');
    expect(sanitized).not.toContain('\u0007');
    expect(sanitized).not.toContain('\u202E');
    expect(sanitized).toContain('\\u001b');
    expect(sanitized).toContain('[U+202E]');
  });

  it('removes credentials from Git remote URLs', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    execFileSync(
      'git',
      ['remote', 'add', 'origin', 'https://alice:super-secret@example.com/org/repo.git'],
      { cwd: project, stdio: 'ignore' },
    );
    const summary = getGitSummary(project);
    expect(summary.remote).toContain('example.com/org/repo.git');
    expect(summary.remote).not.toContain('alice');
    expect(summary.remote).not.toContain('super-secret');
  }, 15_000);

  it('detects secret files and returns redacted findings', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    writeFileSync(join(project, '.env'), `ACCESS_TOKEN=${'x'.repeat(30)}\n`, 'utf8');
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === '.env')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain('x'.repeat(30));
  });

  it('falls back to a filesystem inventory when Git is unavailable', () => {
    const project = root();
    const secret = `sk-${'z'.repeat(30)}`;
    writeFileSync(join(project, 'local.ts'), `const token = '${secret}';\n`, 'utf8');
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === 'local.ts')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('redacts secrets before persisting events or rendering reports', () => {
    const monitor = new AgentMonitor(root());
    const secret = `ghp_${'s'.repeat(30)}`;
    monitor.store.recordEvent('adapter.message', `received ${secret}`, { secret });
    const snapshot = monitor.snapshot();
    expect(JSON.stringify(snapshot.timeline)).not.toContain(secret);
    expect(renderMarkdownReport(snapshot)).not.toContain(secret);
    monitor.close();
  });

  it('refuses a symbolic-link data directory', () => {
    const project = root();
    const target = root();
    mkdirSync(join(target, 'data'), { recursive: true });
    try {
      symlinkSync(join(target, 'data'), join(project, '.codinfy-agent-monitor'), 'junction');
    } catch {
      return;
    }
    expect(() => new AgentMonitor(project)).toThrow(/symbolic link/i);
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

  it('detects dangerous shell commands and clears safe ones', () => {
    expect(detectDangerousCommand('rm -rf /').dangerous).toBe(true);
    expect(detectDangerousCommand('git push --force origin main').dangerous).toBe(true);
    expect(detectDangerousCommand('DROP DATABASE prod;').matches.length).toBeGreaterThan(0);
    expect(detectDangerousCommand('pnpm build').dangerous).toBe(false);
  });

  it('Codix Observer detects blockers and high-context recommendations', () => {
    const advice = getModelAdvice({ task: 'monitor project status' });
    const report = analyzeObserver({
      agents: [
        {
          id: 'a1',
          name: 'Backend Agent',
          role: 'backend',
          status: 'blocked',
          startedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
      ],
      metrics: {
        context: { name: 'context', value: 92, source: 'estimated', updatedAt: '' },
        rate: { name: 'rate', value: 10, source: 'estimated', updatedAt: '' },
        daily: { name: 'daily', value: 10, source: 'estimated', updatedAt: '' },
        weekly: { name: 'weekly', value: 10, source: 'estimated', updatedAt: '' },
      },
      timeline: [
        {
          id: 1,
          type: 'check.tests',
          message: 'tests failed',
          metadata: { success: false, command: 'pnpm test' },
          createdAt: '',
        },
        {
          id: 2,
          type: 'check.tests',
          message: 'tests failed',
          metadata: { success: false, command: 'pnpm test' },
          createdAt: '',
        },
      ],
      advice,
      currentCategory: 'standard_code',
      sensitiveFiles: 0,
      now: Date.now(),
    });
    expect(report.observer).toBe('Codix Observer');
    expect(report.blockers.some((blocker) => blocker.kind === 'blocked_agent')).toBe(true);
    expect(report.blockers.some((blocker) => blocker.kind === 'repeated_command_failure')).toBe(
      true,
    );
    expect(report.recommendations.some((line) => /context/i.test(line))).toBe(true);
  });

  it('renders JSON and HTML reports with attribution and redaction', () => {
    const monitor = new AgentMonitor(root());
    const snapshot = monitor.snapshot();
    const json = JSON.parse(renderJsonReport(snapshot));
    expect(json.command).toBe('/codinfy');
    expect(json.mcp).toBe('codinfy-agent-monitor');
    expect(json.attribution.signature).toBe(CODINFY_ATTRIBUTION.signature);
    const html = renderHtmlReport(snapshot);
    expect(html).toContain('Codinfy Agent Monitor');
    expect(html).toContain(CODINFY_ATTRIBUTION.signature);
    expect(redactSecrets(html)).toBe(html);
    monitor.close();
  });
});
