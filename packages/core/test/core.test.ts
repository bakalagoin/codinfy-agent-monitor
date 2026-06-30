import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  analyzeNodeInventory,
  analyzeObserver,
  buildProjectProcessMap,
  buildResourceGuard,
  categoryForScore,
  checkAttribution,
  compareSemanticVersions,
  controlNodeProcess,
  createConfigurationBackup,
  detectDangerousCommand,
  getGitSummary,
  getModelAdvice,
  redactSecrets,
  renderHtmlReport,
  renderJsonReport,
  renderMarkdownReport,
  restoreConfigurationBackup,
  sanitizeTerminalText,
  scanSecrets,
  spawnTrusted,
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

  it('executes a trusted package-manager wrapper from an absolute runtime path', () => {
    const run = spawnTrusted('pnpm', ['--version'], { cwd: root(), timeout: 30_000 });
    expect(run.status).toBe(0);
  }, 30_000);

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

  it('records host adapter activity as a live agent and redacted timeline event', () => {
    const monitor = new AgentMonitor(root());
    monitor.recordAdapterEvent('codex', 'PostToolUse');
    const agent = monitor.store.getAgent('codex-adapter');
    expect(agent).toMatchObject({ name: 'Codex', role: 'host-adapter', status: 'running' });
    expect(monitor.snapshot().tool).toBe('Codex');
    expect(
      monitor.snapshot().timeline.some((event) => event.type === 'adapter.codex.posttooluse'),
    ).toBe(true);
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
  }, 45_000);

  it('detects secret files and returns redacted findings', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    writeFileSync(join(project, '.env'), `ACCESS_TOKEN=${'x'.repeat(30)}\n`, 'utf8');
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === '.env')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain('x'.repeat(30));
  }, 30_000);

  it('falls back to a filesystem inventory when Git is unavailable', () => {
    const project = root();
    const secret = `sk-${'z'.repeat(30)}`;
    writeFileSync(join(project, 'local.ts'), `const token = '${secret}';\n`, 'utf8');
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === 'local.ts')).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('scans visual assets without treating known image binaries as inventory gaps', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    writeFileSync(join(project, 'preview.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
    expect(scanSecrets(project)).toEqual([]);
  });

  it('detects an ASCII secret embedded in a visual asset without exposing it', () => {
    const project = root();
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    const secret = `ghp_${'v'.repeat(30)}`;
    writeFileSync(
      join(project, 'preview.png'),
      Buffer.concat([Buffer.from([0x89, 0, 1]), Buffer.from(secret)]),
    );
    const findings = scanSecrets(project);
    expect(findings.some((finding) => finding.file === 'preview.png')).toBe(true);
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

describe('Codinfy Agent Monitor v0.2 process safety', () => {
  it('classifies live Node ports, projects, conflicts, and protected identities', () => {
    const project = root();
    const report = analyzeNodeInventory(
      {
        processes: [
          {
            pid: 41001,
            ppid: process.pid,
            name: 'node.exe',
            command: `"C:\\Program Files\\nodejs\\node.exe" "${join(project, 'node_modules', 'vite', 'bin', 'vite.js')}"`,
            cpuPercent: 2.5,
            memoryBytes: 128 * 1024 * 1024,
          },
          { pid: 41002, ppid: process.pid, name: 'node.exe', command: 'node --inspect' },
        ],
        listeners: [
          { address: '127.0.0.1', port: 5173, pid: 41001, processName: 'node.exe' },
          { address: '::1', port: 5173, pid: 41002, processName: 'node.exe' },
        ],
      },
      'win32',
    );
    expect(report.totals).toMatchObject({ active: 2, openPorts: 1, conflicts: 1 });
    expect(report.processes[0]).toMatchObject({ framework: 'Vite', protected: false });
    expect(report.processes[1]).toMatchObject({ project: 'Unknown project', protected: true });
    expect(buildProjectProcessMap(report).projects[0]?.ports).toEqual([5173]);
    expect(buildResourceGuard(report).source).toBe('live');
  });

  it('refuses process changes without confirmation and gates Force Kill', async () => {
    let terminated = false;
    const target = {
      pid: 41001,
      ppid: 1,
      name: 'node',
      command: 'node server.js',
      workingDirectory: root(),
      framework: 'Node.js',
      project: 'sample-app',
      ports: [],
      status: 'running' as const,
      risk: 'low' as const,
      protected: false,
      protectionReasons: [],
      orphanReasons: [],
      recommendation: 'Healthy process. Continue monitoring.',
    };
    const dependencies = {
      inspect: () => target,
      terminate: () => {
        terminated = true;
      },
      alive: () => false,
      wait: async () => undefined,
    };
    const unconfirmed = await controlNodeProcess(
      { pid: target.pid, action: 'stop', confirm: false },
      process.cwd(),
      dependencies,
    );
    expect(unconfirmed.status).toBe('refused');
    expect(terminated).toBe(false);
    const ungatedKill = await controlNodeProcess(
      { pid: target.pid, action: 'kill', confirm: true, gracefulAttempted: false },
      process.cwd(),
      dependencies,
    );
    expect(ungatedKill.status).toBe('refused');
    const stopped = await controlNodeProcess(
      {
        pid: target.pid,
        action: 'stop',
        confirm: true,
        expected: { project: 'sample-app' },
      },
      process.cwd(),
      dependencies,
    );
    expect(stopped.status).toBe('stopped');
    expect(terminated).toBe(true);
  });

  it('compares stable and prerelease semantic versions', () => {
    expect(compareSemanticVersions('0.1.4', '0.2.0')).toBe(-1);
    expect(compareSemanticVersions('v0.2.0', '0.2.0')).toBe(0);
    expect(compareSemanticVersions('0.2.0-beta.2', '0.2.0-beta.10')).toBe(-1);
    expect(compareSemanticVersions('0.2', '0.2.0')).toBeNull();
  });

  it('creates checksum-protected configuration backups and requires restore confirmation', () => {
    const project = root();
    const monitor = new AgentMonitor(project);
    monitor.startSession('Backup test', 'Vitest');
    const backup = createConfigurationBackup(monitor.store.dataRoot);
    expect(backup.valid).toBe(true);
    expect(
      restoreConfigurationBackup({
        dataRoot: monitor.store.dataRoot,
        backupPath: backup.path,
        confirm: false,
      }).ok,
    ).toBe(false);
    expect(
      restoreConfigurationBackup({
        dataRoot: monitor.store.dataRoot,
        backupPath: backup.path,
        confirm: true,
      }).ok,
    ).toBe(true);
    monitor.close();
  });
});
