import { existsSync, readFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveTrustedExecutable } from './execution.js';
import type { EnvironmentStatus } from './types.js';

function version(command: string, cwd: string, args = ['--version']): string | null {
  const executable = resolveTrustedExecutable(command, cwd);
  if (!executable) return null;
  if (['.cmd', '.bat'].includes(extname(executable).toLowerCase())) return 'available';
  try {
    return (
      execFileSync(executable, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1_000,
      })
        .trim()
        .split(/\r?\n/)[0] ?? null
    );
  } catch {
    return null;
  }
}

function detectStacks(cwd: string): string[] {
  const stacks = new Set<string>();
  const packagePath = join(cwd, 'package.json');
  if (existsSync(packagePath)) {
    stacks.add('Node');
    try {
      const raw = readFileSync(packagePath, 'utf8');
      for (const stack of [
        'TypeScript',
        'Vite',
        'React',
        'Next.js',
        'Vue',
        'Express',
        'NestJS',
        'Fastify',
      ]) {
        const needle = stack === 'Next.js' ? 'next' : stack.toLowerCase();
        if (raw.toLowerCase().includes(`"${needle.toLowerCase()}"`)) stacks.add(stack);
      }
    } catch {
      /* unreadable package */
    }
  }
  if (existsSync(join(cwd, 'artisan'))) stacks.add('Laravel');
  if (existsSync(join(cwd, 'pubspec.yaml'))) stacks.add('Flutter');
  if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'pyproject.toml')))
    stacks.add('Python');
  if (existsSync(join(cwd, 'Dockerfile')) || existsSync(join(cwd, 'docker-compose.yml')))
    stacks.add('Docker');
  return [...stacks];
}

export function getEnvironmentStatus(cwd: string): EnvironmentStatus {
  const isDocker = existsSync('/.dockerenv') || Boolean(process.env.CONTAINER);
  const panel = process.env.CPANEL
    ? 'cPanel'
    : process.env.PLESK
      ? 'Plesk'
      : process.env.COOLIFY
        ? 'Coolify'
        : null;
  const configuredType = process.env.CODINFY_HOST_TYPE as EnvironmentStatus['type'] | undefined;
  const type: EnvironmentStatus['type'] =
    configuredType ??
    panel ??
    (isDocker ? 'Docker' : process.env.SSH_CONNECTION ? 'VPS' : 'Localhost');
  return {
    type,
    os: `${platform()} ${release()}`,
    shell: process.env.SHELL ?? process.env.COMSPEC ?? 'unknown',
    tools: {
      node: process.version,
      npm: version('npm', cwd),
      pnpm: version('pnpm', cwd),
      yarn: version('yarn', cwd),
      git: version('git', cwd),
      docker: version('docker', cwd),
      php: version('php', cwd),
      composer: version('composer', cwd),
      python: version(platform() === 'win32' ? 'python' : 'python3', cwd),
      java: version('java', cwd),
      redis: version('redis-server', cwd),
    },
    longRunningProcesses: type !== 'Shared Hosting',
    detectedStacks: detectStacks(cwd),
  };
}
