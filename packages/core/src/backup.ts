import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { redactSecrets } from './security.js';
import { CODINFY_MONITOR_VERSION } from './update-center.js';

export interface ConfigurationBackup {
  schemaVersion: 1;
  createdAt: string;
  monitorVersion: string;
  projectName: string;
  config: Record<string, unknown>;
  checksum: string;
  attribution: 'CODINFY PLATFORMS SASU · codinfy.com';
}

export interface BackupSummary {
  path: string;
  file: string;
  createdAt: string;
  monitorVersion: string;
  projectName: string;
  valid: boolean;
}

function isWithin(parent: string, candidate: string): boolean {
  const value = relative(resolve(parent), resolve(candidate));
  return value === '' || (!value.startsWith('..') && !isAbsolute(value));
}

function assertPlainPath(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error(`Refusing symbolic link for backup operation: ${path}`);
}

function checksum(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function safeConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The configuration must be a JSON object.');
  return JSON.parse(redactSecrets(JSON.stringify(value))) as Record<string, unknown>;
}

function readBackup(path: string): ConfigurationBackup {
  assertPlainPath(path);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ConfigurationBackup;
  if (parsed.schemaVersion !== 1 || !parsed.config || typeof parsed.config !== 'object')
    throw new Error('Unsupported or invalid Codinfy backup.');
  if (checksum(parsed.config) !== parsed.checksum)
    throw new Error('Backup checksum verification failed.');
  return parsed;
}

export function createConfigurationBackup(dataRoot: string): BackupSummary {
  const root = resolve(dataRoot);
  const configPath = join(root, 'config.json');
  const backupRoot = join(root, 'backups');
  assertPlainPath(root);
  assertPlainPath(configPath);
  assertPlainPath(backupRoot);
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  if (!existsSync(configPath)) throw new Error('Codinfy configuration file does not exist.');
  const config = safeConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const createdAt = new Date().toISOString();
  const core = {
    schemaVersion: 1 as const,
    createdAt,
    monitorVersion: CODINFY_MONITOR_VERSION,
    projectName: String(config.projectName ?? 'Unknown project').slice(0, 240),
    config,
  };
  const payload: ConfigurationBackup = {
    ...core,
    checksum: checksum(config),
    attribution: 'CODINFY PLATFORMS SASU · codinfy.com',
  };
  const stamp = createdAt.replace(/[:.]/g, '-');
  const path = join(backupRoot, `config-${stamp}.codinfy-backup.json`);
  assertPlainPath(path);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort on platforms without POSIX modes */
  }
  return {
    path,
    file: basename(path),
    createdAt,
    monitorVersion: payload.monitorVersion,
    projectName: payload.projectName,
    valid: true,
  };
}

export function listConfigurationBackups(dataRoot: string): BackupSummary[] {
  const backupRoot = join(resolve(dataRoot), 'backups');
  assertPlainPath(backupRoot);
  if (!existsSync(backupRoot)) return [];
  return readdirSync(backupRoot)
    .filter((file) => file.endsWith('.codinfy-backup.json'))
    .map((file): BackupSummary => {
      const path = join(backupRoot, file);
      try {
        const backup = readBackup(path);
        return {
          path,
          file,
          createdAt: backup.createdAt,
          monitorVersion: backup.monitorVersion,
          projectName: backup.projectName,
          valid: true,
        };
      } catch {
        return {
          path,
          file,
          createdAt: statSync(path).mtime.toISOString(),
          monitorVersion: 'unknown',
          projectName: 'Unknown project',
          valid: false,
        };
      }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function restoreConfigurationBackup(input: {
  dataRoot: string;
  backupPath: string;
  confirm: boolean;
}): { ok: boolean; restoredFrom?: string; safetyBackup?: BackupSummary; message: string } {
  if (input.confirm !== true) return { ok: false, message: 'Explicit confirmation is required.' };
  const root = resolve(input.dataRoot);
  const backupRoot = join(root, 'backups');
  const path = resolve(input.backupPath);
  if (!isWithin(backupRoot, path))
    return { ok: false, message: 'Backup path is outside Codinfy storage.' };
  const backup = readBackup(path);
  const safetyBackup = createConfigurationBackup(root);
  const configPath = join(root, 'config.json');
  assertPlainPath(configPath);
  writeFileSync(configPath, `${JSON.stringify(safeConfig(backup.config), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return {
    ok: true,
    restoredFrom: path,
    safetyBackup,
    message: `Configuration restored from ${basename(path)}.`,
  };
}
