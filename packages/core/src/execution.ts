import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

const executableCache = new Map<string, string | null>();

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function executableExtensions(): string[] {
  if (process.platform !== 'win32') return [''];
  return (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
}

export function resolveTrustedExecutable(command: string, cwd: string): string | null {
  if (!/^[a-z0-9._-]+$/i.test(command)) return null;
  const projectRoot = resolve(cwd);
  const cacheKey = `${projectRoot}\0${command}\0${process.env.PATH ?? ''}`;
  if (executableCache.has(cacheKey)) return executableCache.get(cacheKey) ?? null;
  for (const rawDirectory of (process.env.PATH ?? '').split(delimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, '');
    if (!directory || !isAbsolute(directory)) continue;
    let realDirectory: string;
    try {
      realDirectory = realpathSync(directory);
    } catch {
      continue;
    }
    if (isWithin(projectRoot, realDirectory)) continue;
    for (const extension of executableExtensions()) {
      for (const suffix of new Set([extension.toLowerCase(), extension.toUpperCase()])) {
        const candidate = join(realDirectory, `${command}${suffix}`);
        try {
          if (!statSync(candidate).isFile()) continue;
          const realCandidate = realpathSync(candidate);
          if (isWithin(projectRoot, realCandidate)) continue;
          if (process.platform !== 'win32') accessSync(realCandidate, constants.X_OK);
          executableCache.set(cacheKey, realCandidate);
          return realCandidate;
        } catch {
          /* keep searching */
        }
      }
    }
  }
  executableCache.set(cacheKey, null);
  return null;
}

export function execTrustedFileSync(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number },
): string {
  const executable = resolveTrustedExecutable(command, options.cwd);
  if (!executable) throw new Error(`Trusted executable not found: ${command}`);
  if (['.cmd', '.bat'].includes(extname(executable).toLowerCase()))
    throw new Error(`Script wrapper cannot be executed directly: ${command}`);
  return execFileSync(executable, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: options.timeout ?? 10_000,
  });
}

function trustedWindowsShell(): string {
  const shell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
  if (!existsSync(shell)) throw new Error('Trusted Windows command shell not found.');
  return shell;
}

/**
 * Execute a PowerShell program that is fully defined by Codinfy Agent Monitor.
 *
 * This helper deliberately does not accept arguments to interpolate into the
 * program. Callers must use it only with a static source string. Keeping this
 * separate from spawnTrusted prevents user-controlled values from becoming
 * PowerShell code while still allowing read-only Windows system inventory.
 */
export function execTrustedStaticPowerShell(
  source: string,
  options: { cwd: string; timeout?: number },
): string {
  if (process.platform !== 'win32')
    throw new Error('Static PowerShell execution is only available on Windows.');
  if (!source.trim()) throw new Error('A static PowerShell program is required.');
  const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const candidates = [
    join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    join(windowsRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('Trusted Windows PowerShell executable not found.');
  return execFileSync(
    executable,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', source],
    {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: options.timeout ?? 15_000,
      windowsHide: true,
    },
  );
}

function safeCommandArgument(value: string): string {
  if (!/^[a-z0-9_:@./\\=+() -]+$/i.test(value))
    throw new Error(`Unsafe package-manager argument rejected: ${value}`);
  return `"${value}"`;
}

export function spawnTrusted(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  const executable = resolveTrustedExecutable(command, options.cwd);
  if (!executable) throw new Error(`Trusted executable not found: ${command}`);
  const shared = {
    cwd: options.cwd,
    encoding: 'utf8' as const,
    shell: false,
    timeout: options.timeout,
    env: options.env,
  };
  if (
    process.platform === 'win32' &&
    ['.cmd', '.bat'].includes(extname(executable).toLowerCase())
  ) {
    const invocation = `"${[safeCommandArgument(executable), ...args.map(safeCommandArgument)].join(
      ' ',
    )}"`;
    return spawnSync(trustedWindowsShell(), ['/d', '/s', '/c', invocation], {
      ...shared,
      windowsVerbatimArguments: true,
    });
  }
  return spawnSync(executable, args, shared);
}

export function executableDirectory(command: string, cwd: string): string | null {
  const executable = resolveTrustedExecutable(command, cwd);
  return executable ? dirname(executable) : null;
}
