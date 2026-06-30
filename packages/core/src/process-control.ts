import { spawnTrusted } from './execution.js';
import { inspectNodeProcess, scanNodeServers, type NodeServerProcess } from './node-monitor.js';
import { redactSecrets } from './security.js';

export interface ProcessIdentityExpectation {
  project?: string;
  framework?: string;
  port?: number;
}

export interface ProcessControlRequest {
  pid: number;
  action: 'stop' | 'kill';
  confirm: boolean;
  expected?: ProcessIdentityExpectation;
  gracefulAttempted?: boolean;
}

export interface ProcessControlResult {
  ok: boolean;
  action: 'stop' | 'kill';
  pid: number;
  status: 'refused' | 'requested' | 'stopped' | 'still_running' | 'not_found';
  message: string;
  process?: NodeServerProcess;
  requiresConfirmation: boolean;
  forceAvailable: boolean;
  warning?: string;
}

export interface CleanupRecommendation {
  pid: number;
  project: string;
  ports: number[];
  priority: 'review' | 'urgent';
  reason: string;
  action: 'inspect' | 'stop_gracefully';
  requiresConfirmation: true;
}

interface ControlDependencies {
  inspect?: (pid: number, projectRoot: string) => NodeServerProcess | null;
  terminate?: (pid: number, force: boolean, projectRoot: string) => void;
  alive?: (pid: number) => boolean;
  wait?: (milliseconds: number) => Promise<void>;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminate(pid: number, force: boolean, projectRoot: string): void {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid)];
    if (force) args.push('/F');
    const result = spawnTrusted('taskkill', args, { cwd: projectRoot, timeout: 10_000 });
    if (result.status !== 0) {
      const message = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      throw new Error(message || `taskkill exited with status ${result.status ?? 'unknown'}`);
    }
    return;
  }
  process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
}

function identityMismatch(
  target: NodeServerProcess,
  expected: ProcessIdentityExpectation | undefined,
): string | null {
  if (!expected) return null;
  if (expected.project && target.project !== expected.project)
    return `Project changed from ${expected.project} to ${target.project}.`;
  if (expected.framework && target.framework !== expected.framework)
    return `Framework changed from ${expected.framework} to ${target.framework}.`;
  if (expected.port && !target.ports.some((port) => port.port === expected.port))
    return `Port ${expected.port} is no longer owned by this process.`;
  return null;
}

function refused(
  request: ProcessControlRequest,
  message: string,
  process?: NodeServerProcess,
): ProcessControlResult {
  return {
    ok: false,
    action: request.action,
    pid: request.pid,
    status: 'refused',
    message,
    process,
    requiresConfirmation: true,
    forceAvailable: request.action === 'kill' && request.gracefulAttempted === true,
  };
}

export async function controlNodeProcess(
  request: ProcessControlRequest,
  projectRoot = process.cwd(),
  dependencies: ControlDependencies = {},
): Promise<ProcessControlResult> {
  if (!Number.isInteger(request.pid) || request.pid <= 0)
    return refused(request, 'A positive process ID is required.');
  if (request.confirm !== true)
    return refused(request, 'Explicit confirmation is required before changing a process.');
  if (request.pid === process.pid || request.pid === process.ppid)
    return refused(request, 'Codinfy refuses to stop its own runtime process family.');
  if (request.action === 'kill' && request.gracefulAttempted !== true)
    return refused(
      request,
      'Force Kill is available only after a failed graceful stop and a second confirmation.',
    );

  const inspect = dependencies.inspect ?? inspectNodeProcess;
  const target = inspect(request.pid, projectRoot);
  if (!target) {
    return {
      ok: false,
      action: request.action,
      pid: request.pid,
      status: 'not_found',
      message: 'The selected Node server no longer exists or is no longer identifiable.',
      requiresConfirmation: true,
      forceAvailable: false,
    };
  }
  if (target.protected)
    return refused(
      request,
      `Protected process: ${target.protectionReasons.join('; ')}. Inspect it instead.`,
      target,
    );
  if (!target.command || target.project === 'Unknown project')
    return refused(
      request,
      'The process identity is incomplete and cannot be changed safely.',
      target,
    );
  const mismatch = identityMismatch(target, request.expected);
  if (mismatch) return refused(request, `Process identity changed. ${mismatch}`, target);

  const kill = dependencies.terminate ?? terminate;
  const isAlive = dependencies.alive ?? alive;
  const wait =
    dependencies.wait ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
  try {
    kill(request.pid, request.action === 'kill', projectRoot);
    await wait(request.action === 'kill' ? 350 : 1_250);
  } catch (error) {
    return {
      ok: false,
      action: request.action,
      pid: request.pid,
      status: 'still_running',
      message: redactSecrets(error instanceof Error ? error.message : String(error)),
      process: target,
      requiresConfirmation: true,
      forceAvailable: request.action === 'stop',
      warning:
        process.platform === 'win32' && request.action === 'stop'
          ? 'Windows does not provide POSIX SIGTERM semantics for unrelated processes.'
          : undefined,
    };
  }
  const running = isAlive(request.pid);
  return {
    ok: !running,
    action: request.action,
    pid: request.pid,
    status: running ? 'still_running' : 'stopped',
    message: running
      ? 'The process is still running. Re-inspect it before considering Force Kill.'
      : `Process ${request.pid} stopped.`,
    process: target,
    requiresConfirmation: true,
    forceAvailable: running && request.action === 'stop',
    warning:
      process.platform === 'win32' && request.action === 'stop'
        ? 'Windows cannot guarantee POSIX graceful-signal behavior.'
        : undefined,
  };
}

export function nodeCleanupRecommendations(projectRoot = process.cwd()): CleanupRecommendation[] {
  const report = scanNodeServers(projectRoot);
  return report.processes
    .filter((item) => item.status === 'orphan' || item.risk === 'high')
    .map((item) => ({
      pid: item.pid,
      project: item.project,
      ports: item.ports.map((port) => port.port),
      priority: item.risk === 'high' ? ('urgent' as const) : ('review' as const),
      reason:
        item.orphanReasons.join('; ') ||
        report.conflicts
          .filter((conflict) => conflict.pids.includes(item.pid))
          .map((conflict) => conflict.message)
          .join('; ') ||
        'High resource usage or public exposure requires review.',
      action: item.protected ? ('inspect' as const) : ('stop_gracefully' as const),
      requiresConfirmation: true as const,
    }));
}
