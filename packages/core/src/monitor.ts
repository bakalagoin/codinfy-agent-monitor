import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODINFY_ATTRIBUTION } from './attribution.js';
import { getEnvironmentStatus } from './environment.js';
import { getGitSummary } from './git.js';
import { detectLanguage } from './i18n.js';
import { getModelAdvice } from './model-router.js';
import { checkAttribution, writeMarkdownReport } from './report.js';
import { isSensitivePath, scanSecrets } from './security.js';
import { MonitorStore } from './storage.js';
import type {
  AgentStatus,
  EnvironmentStatus,
  Language,
  MetricSource,
  ModelCategory,
  MonitorSnapshot,
  MonitorTask,
  ReviewResult,
} from './types.js';

export class AgentMonitor {
  readonly store: MonitorStore;

  constructor(projectRoot = process.cwd(), dataRoot?: string) {
    this.store = new MonitorStore(projectRoot, dataRoot);
  }

  get language(): Language {
    const configured = this.store.getConfig().language;
    return detectLanguage(configured === 'auto' ? undefined : configured);
  }

  startSession(name: string, tool = 'MCP-compatible tool') {
    const config = this.store.updateConfig({ sessionName: name, tool });
    return this.store.recordEvent('session.started', `Session started: ${name}`, {
      tool,
      project: config.projectName,
    });
  }

  snapshot(): MonitorSnapshot {
    const config = this.store.getConfig();
    const metrics = this.store.getMetrics();
    const agents = this.store.listAgents();
    const tasks = this.store.listTasks();
    const timeline = this.store.timeline(12);
    const activeAgents = agents.filter((agent) =>
      ['active', 'thinking', 'running', 'reading', 'writing'].includes(agent.status),
    ).length;
    const errors = agents.filter((agent) => agent.status === 'error').length;
    const blockers =
      agents.filter((agent) => agent.status === 'blocked').length +
      tasks.filter((task) => task.status === 'blocked').length;
    const workflowProgress = tasks.length
      ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
      : 0;
    const advice = getModelAdvice({
      task: tasks.find((task) => task.status === 'in_progress')?.title ?? 'monitor project status',
      currentCategory: config.currentCategory,
      risk: blockers || errors ? 'high' : 'low',
      fileCount: getGitSummary(this.store.projectRoot).files.length,
      activeAgents,
      contextUsage: metrics.context.value,
      dailyUsage: metrics.daily.value,
      weeklyUsage: metrics.weekly.value,
      recentErrors: errors,
      level: config.level,
    });
    const git = getGitSummary(this.store.projectRoot);
    return {
      project: config.projectName,
      session: config.sessionName,
      tool: config.tool,
      currentModel: config.currentModel,
      metrics,
      agents,
      tasks,
      workflowProgress,
      timeline,
      git,
      advice,
      errors,
      blockers,
      latestAction: timeline[0]?.message ?? 'No activity recorded yet',
      estimateMode: Object.values(metrics).some((metric) => metric.source === 'estimated'),
    };
  }

  registerAgent(input: {
    id?: string;
    name: string;
    role: string;
    status?: AgentStatus;
    task?: string;
    modelCategory?: ModelCategory;
  }) {
    return this.store.registerAgent(input);
  }

  updateAgent(
    id: string,
    input: {
      status: AgentStatus;
      task?: string;
      lastAction?: string;
      lastFile?: string;
      modelCategory?: ModelCategory;
    },
  ) {
    return this.store.updateAgent(id, input);
  }

  createTask(input: {
    id?: string;
    title: string;
    status?: MonitorTask['status'];
    agentId?: string;
    progress?: number;
  }) {
    return this.store.createTask(input);
  }

  updateTask(
    id: string,
    input: { status?: MonitorTask['status']; progress?: number; agentId?: string },
  ) {
    return this.store.updateTask(id, input);
  }

  setMetric(
    name: 'context' | 'rate' | 'daily' | 'weekly',
    value: number,
    source: MetricSource = 'estimated',
  ) {
    return this.store.setMetric(name, value, source);
  }

  environment(): EnvironmentStatus {
    return getEnvironmentStatus(this.store.projectRoot);
  }

  review(): ReviewResult {
    const git = getGitSummary(this.store.projectRoot);
    const secretFindings = scanSecrets(this.store.projectRoot);
    const attributionMissing = checkAttribution(this.store.projectRoot);
    const latestTest = this.store.latestEvent('check.tests');
    const latestBuild = this.store.latestEvent('check.build');
    const tests =
      latestTest?.metadata?.success === true ? 'passed' : latestTest ? 'failed' : 'not_run';
    const build =
      latestBuild?.metadata?.success === true ? 'passed' : latestBuild ? 'failed' : 'not_run';
    const sensitiveFiles = git.files.filter(isSensitivePath);
    const notes: string[] = [];
    if (tests === 'not_run') notes.push('Tests have not been recorded in this session.');
    if (build === 'not_run') notes.push('Build has not been recorded in this session.');
    if (sensitiveFiles.length)
      notes.push(`${sensitiveFiles.length} sensitive file(s) changed; review manually.`);
    const ready =
      secretFindings.length === 0 &&
      Object.keys(attributionMissing).length === 0 &&
      tests === 'passed' &&
      build === 'passed';
    return { ready, secretFindings, attributionMissing, git, tests, build, sensitiveFiles, notes };
  }

  runProjectScript(kind: 'tests' | 'build'): { success: boolean; command: string; output: string } {
    const packagePath = join(this.store.projectRoot, 'package.json');
    if (!existsSync(packagePath)) {
      const result = { success: false, command: 'none', output: 'No package.json found.' };
      this.store.recordEvent(`check.${kind}`, result.output, {
        success: false,
        command: result.command,
      });
      return result;
    }
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
    const script = kind === 'tests' ? 'test' : 'build';
    if (!packageJson.scripts?.[script]) {
      const result = { success: false, command: 'none', output: `No ${script} script found.` };
      this.store.recordEvent(`check.${kind}`, result.output, {
        success: false,
        command: result.command,
      });
      return result;
    }
    const manager = packageJson.packageManager?.startsWith('pnpm')
      ? 'pnpm'
      : packageJson.packageManager?.startsWith('yarn')
        ? 'yarn'
        : 'npm';
    const managerArgs = manager === 'npm' ? ['run', script] : [script];
    const isWindows = process.platform === 'win32';
    const command = isWindows
      ? (process.env.ComSpec ?? 'cmd.exe')
      : manager === 'pnpm' || manager === 'yarn'
        ? 'corepack'
        : manager;
    const args = isWindows
      ? [
          '/d',
          '/s',
          '/c',
          manager === 'pnpm' || manager === 'yarn'
            ? `corepack ${manager} ${managerArgs.join(' ')}`
            : `${manager} ${managerArgs.join(' ')}`,
        ]
      : manager === 'pnpm' || manager === 'yarn'
        ? [manager, ...managerArgs]
        : managerArgs;
    const run = spawnSync(command, args, {
      cwd: this.store.projectRoot,
      encoding: 'utf8',
      shell: false,
      env: { ...process.env, CI: 'true' },
      timeout: 300_000,
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().slice(-20_000);
    const success = run.status === 0;
    this.store.recordEvent(`check.${kind}`, `${kind} ${success ? 'passed' : 'failed'}`, {
      success,
      command: `${manager} ${managerArgs.join(' ')}`,
    });
    return { success, command: `${manager} ${managerArgs.join(' ')}`, output };
  }

  exportReport(withReview = true): string {
    const review = withReview ? this.review() : undefined;
    const path = writeMarkdownReport(this.store.dataRoot, this.snapshot(), review);
    this.store.recordEvent('report.exported', `Report exported: ${path}`);
    return path;
  }

  attribution() {
    return CODINFY_ATTRIBUTION;
  }
  reset(): void {
    this.store.reset();
  }
  close(): void {
    this.store.close();
  }
}
