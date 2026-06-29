import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnTrusted } from './execution.js';
import { redactSecrets } from './security.js';

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'unknown';

export interface DependencyHealth {
  manager: PackageManager;
  lockfile: string | null;
  auditCommand: string;
  outdatedCommand: string;
  ran: boolean;
  outdated?: string;
  audit?: string;
}

function detectManager(cwd: string): { manager: PackageManager; lockfile: string | null } {
  if (existsSync(join(cwd, 'pnpm-lock.yaml')))
    return { manager: 'pnpm', lockfile: 'pnpm-lock.yaml' };
  if (existsSync(join(cwd, 'yarn.lock'))) return { manager: 'yarn', lockfile: 'yarn.lock' };
  if (existsSync(join(cwd, 'package-lock.json')))
    return { manager: 'npm', lockfile: 'package-lock.json' };
  const packagePath = join(cwd, 'package.json');
  if (existsSync(packagePath)) {
    try {
      const raw = JSON.parse(readFileSync(packagePath, 'utf8')) as { packageManager?: string };
      if (raw.packageManager?.startsWith('pnpm')) return { manager: 'pnpm', lockfile: null };
      if (raw.packageManager?.startsWith('yarn')) return { manager: 'yarn', lockfile: null };
    } catch {
      /* unreadable package.json */
    }
    return { manager: 'npm', lockfile: null };
  }
  return { manager: 'unknown', lockfile: null };
}

function runManager(cwd: string, manager: PackageManager, args: string[]): string {
  if (manager === 'unknown') return 'Package manager unavailable.';
  try {
    const result = spawnTrusted(manager, args, {
      cwd,
      timeout: 60_000,
      env: { ...process.env, CI: 'true' },
    });
    return (
      redactSecrets(`${result.stdout ?? ''}${result.stderr ?? ''}`)
        .trim()
        .slice(0, 8_000) || 'No output.'
    );
  } catch (error) {
    return redactSecrets(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Inspect dependency health. By default this is read-only and does not execute
 * any package-manager command (which may hit the network); pass `run` to execute
 * `outdated` and `audit`.
 */
export function getDependencyHealth(cwd: string, run = false): DependencyHealth {
  const { manager, lockfile } = detectManager(cwd);
  const auditCommand = `${manager === 'unknown' ? 'npm' : manager} audit`;
  const outdatedCommand = `${manager === 'unknown' ? 'npm' : manager} outdated`;
  const health: DependencyHealth = {
    manager,
    lockfile,
    auditCommand,
    outdatedCommand,
    ran: false,
  };
  if (run && manager !== 'unknown') {
    health.ran = true;
    health.outdated = runManager(cwd, manager, ['outdated']);
    health.audit = runManager(cwd, manager, ['audit']);
  }
  return health;
}
