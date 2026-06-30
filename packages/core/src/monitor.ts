import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODINFY_ATTRIBUTION } from './attribution.js';
import {
  createConfigurationBackup,
  listConfigurationBackups,
  restoreConfigurationBackup,
} from './backup.js';
import { runHealthDoctor } from './doctor.js';
import { getEnvironmentStatus } from './environment.js';
import { spawnTrusted } from './execution.js';
import { getGitSummary } from './git.js';
import { detectLanguage } from './i18n.js';
import { getModelAdvice } from './model-router.js';
import { inspectNodeProcess, scanNodeServers } from './node-monitor.js';
import { analyzeObserver } from './observer.js';
import {
  controlNodeProcess,
  nodeCleanupRecommendations,
  type ProcessControlRequest,
} from './process-control.js';
import { checkAttribution, writeReport, type ReportFormat } from './report.js';
import { getProjectProcessMap, getResourceGuard } from './resource-guard.js';
import { isSensitivePath, redactSecrets, scanSecrets } from './security.js';
import { MonitorStore } from './storage.js';
import { checkForUpdates, installNpmUpdate, updatePreflight } from './update-center.js';
import type {
  AgentStatus,
  EnvironmentStatus,
  Language,
  MetricSource,
  ModelCategory,
  MonitorSnapshot,
  MonitorTask,
  ObserverReport,
  ReviewResult,
} from './types.js';

export class AgentMonitor {
  readonly store: MonitorStore;
  private environmentCache?: EnvironmentStatus;

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

  recordAdapterEvent(host: 'claude' | 'codex' | 'cursor' | 'windsurf', event: string) {
    const hosts = {
      claude: 'Claude Code',
      codex: 'Codex',
      cursor: 'Cursor',
      windsurf: 'Windsurf',
    } as const;
    const name = hosts[host];
    const normalized = event.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) || 'activity';
    const status: AgentStatus = /(?:end|stop|complete|response)$/i.test(normalized)
      ? 'idle'
      : /(?:fail|error)/i.test(normalized)
        ? 'error'
        : /(?:write|edit)/i.test(normalized)
          ? 'writing'
          : /(?:read)/i.test(normalized)
            ? 'reading'
            : /(?:tool|command|run)/i.test(normalized)
              ? 'running'
              : 'active';
    const agent = this.store.registerAgent({
      id: `${host}-adapter`,
      name,
      role: 'host-adapter',
      status,
      task: normalized,
    });
    this.store.updateConfig({ tool: name });
    this.store.updateAgent(agent.id, {
      status,
      task: normalized,
      lastAction: normalized,
    });
    return this.store.recordEvent(
      `adapter.${host}.${normalized.toLowerCase()}`,
      `${name}: ${normalized}`,
      {
        host,
        event: normalized,
        success: !/(?:fail|error)/i.test(normalized),
      },
    );
  }

  snapshot(): MonitorSnapshot {
    const config = this.store.getConfig();
    const metrics = this.store.getMetrics();
    const agents = this.store.listAgents();
    const tasks = this.store.listTasks();
    const timeline = this.store.timeline(12);
    const git = getGitSummary(this.store.projectRoot);
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
      fileCount: git.files.length,
      activeAgents,
      contextUsage: metrics.context.value,
      dailyUsage: metrics.daily.value,
      weeklyUsage: metrics.weekly.value,
      recentErrors: errors,
      level: config.level,
    });
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
    this.environmentCache ??= getEnvironmentStatus(this.store.projectRoot);
    return this.environmentCache;
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
    let run;
    try {
      run = spawnTrusted(manager, managerArgs, {
        cwd: this.store.projectRoot,
        env: { ...process.env, CI: 'true' },
        timeout: 300_000,
      });
    } catch (error) {
      const output = redactSecrets(error instanceof Error ? error.message : String(error));
      this.store.recordEvent(`check.${kind}`, `${kind} failed`, {
        success: false,
        command: `${manager} ${managerArgs.join(' ')}`,
      });
      return { success: false, command: `${manager} ${managerArgs.join(' ')}`, output };
    }
    const output = redactSecrets(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim().slice(-20_000));
    const success = run.status === 0;
    this.store.recordEvent(`check.${kind}`, `${kind} ${success ? 'passed' : 'failed'}`, {
      success,
      command: `${manager} ${managerArgs.join(' ')}`,
    });
    return { success, command: `${manager} ${managerArgs.join(' ')}`, output };
  }

  observer(): ObserverReport {
    const snapshot = this.snapshot();
    return analyzeObserver({
      agents: snapshot.agents,
      metrics: snapshot.metrics,
      timeline: this.store.timeline(100),
      advice: snapshot.advice,
      currentCategory: this.store.getConfig().currentCategory,
      sensitiveFiles: snapshot.git.files.filter(isSensitivePath).length,
    });
  }

  exportReport(withReview = true, format: ReportFormat = 'md'): string {
    const review = withReview ? this.review() : undefined;
    const path = writeReport(this.store.dataRoot, this.snapshot(), review, format);
    this.store.recordEvent('report.exported', `Report exported: ${path}`);
    return path;
  }

  attribution() {
    return CODINFY_ATTRIBUTION;
  }

  nodeServers() {
    return scanNodeServers(this.store.projectRoot);
  }

  nodePorts() {
    const report = this.nodeServers();
    return { generatedAt: report.generatedAt, ports: report.ports, conflicts: report.conflicts };
  }

  nodeOrphans() {
    const report = this.nodeServers();
    return report.processes.filter((item) => item.status === 'orphan');
  }

  inspectNodeProcess(pid: number) {
    return inspectNodeProcess(pid, this.store.projectRoot);
  }

  nodeCleanupRecommendations() {
    return nodeCleanupRecommendations(this.store.projectRoot);
  }

  async controlNodeProcess(request: ProcessControlRequest) {
    const result = await controlNodeProcess(request, this.store.projectRoot);
    this.store.recordEvent(`node.${request.action}.${result.status}`, result.message, {
      pid: request.pid,
      ok: result.ok,
      confirmed: request.confirm === true,
    });
    return result;
  }

  projectProcessMap() {
    return getProjectProcessMap(this.store.projectRoot);
  }

  resourceGuard() {
    return getResourceGuard(this.store.projectRoot);
  }

  async updateStatus() {
    const settings = this.store.getConfig().updates;
    const status = await checkForUpdates({
      repository: settings.repository,
      channel: settings.channel,
      projectRoot: this.store.projectRoot,
    });
    this.store.recordEvent(
      'update.checked',
      status.error ?? `Latest version: ${status.latestVersion ?? 'unknown'}`,
      {
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        updateAvailable: status.updateAvailable,
      },
    );
    return status;
  }

  updatePreflight() {
    return updatePreflight(
      this.store.projectRoot,
      listConfigurationBackups(this.store.dataRoot).length > 0,
    );
  }

  installUpdate(version: string, confirm: boolean, allowDowngrade = false) {
    const result = installNpmUpdate({
      version,
      confirm,
      projectRoot: this.store.projectRoot,
      allowDowngrade,
    });
    this.store.recordEvent(`update.install.${result.status}`, result.message, {
      version,
      confirmed: confirm === true,
    });
    return result;
  }

  createBackup() {
    const backup = createConfigurationBackup(this.store.dataRoot);
    this.store.recordEvent('backup.created', `Configuration backup created: ${backup.file}`);
    return backup;
  }

  listBackups() {
    return listConfigurationBackups(this.store.dataRoot);
  }

  restoreBackup(backupPath: string, confirm: boolean) {
    const result = restoreConfigurationBackup({
      dataRoot: this.store.dataRoot,
      backupPath,
      confirm,
    });
    this.store.recordEvent(
      `backup.restore.${result.ok ? 'completed' : 'refused'}`,
      result.message,
      {
        confirmed: confirm === true,
      },
    );
    return result;
  }

  healthDoctor() {
    return runHealthDoctor(this.store.projectRoot, this.store.dataRoot);
  }

  reset(): void {
    this.store.reset();
  }
  close(): void {
    this.store.close();
  }
}
