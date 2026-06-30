import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getGitSummary } from './git.js';
import { spawnTrusted } from './execution.js';
import { redactSecrets, scanSecrets } from './security.js';

export const CODINFY_MONITOR_VERSION = '0.2.0';
export const CODINFY_RELEASE_REPOSITORY = 'bakalagoin/codinfy-agent-monitor';

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
}

export interface UpdateRelease {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt?: string;
  prerelease: boolean;
  draft: boolean;
  breakingChanges: string[];
}

export interface UpdateStatus {
  checkedAt: string;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  comparison: 'older' | 'current' | 'newer' | 'unknown';
  channel: 'stable' | 'prerelease';
  repository: string;
  release?: UpdateRelease;
  installMethod: 'npm-global' | 'git-checkout' | 'workspace' | 'unknown';
  autoInstall: false;
  requiresConfirmation: true;
  error?: string;
}

export interface UpdatePreflight {
  checkedAt: string;
  ready: boolean;
  checks: Array<{
    id: 'version' | 'git' | 'secrets' | 'attribution' | 'runtime' | 'backup';
    status: 'passed' | 'warning' | 'failed';
    message: string;
  }>;
  requiresConfirmation: true;
}

export interface UpdateExecutionResult {
  ok: boolean;
  status: 'refused' | 'installed' | 'failed';
  version: string;
  command?: string;
  message: string;
  output?: string;
  requiresConfirmation: true;
}

function identifierOrder(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

export function parseSemanticVersion(value: string): SemanticVersion | null {
  const match = value
    .trim()
    .match(
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
    );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
    raw: value,
  };
}

export function compareSemanticVersions(leftValue: string, rightValue: string): number | null {
  const left = parseSemanticVersion(leftValue);
  const right = parseSemanticVersion(rightValue);
  if (!left || !right) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const order = identifierOrder(leftIdentifier, rightIdentifier);
    if (order) return order;
  }
  return 0;
}

function breakingChanges(notes: string): string[] {
  const lines = notes.split(/\r?\n/);
  const results: string[] = [];
  let active = false;
  for (const line of lines) {
    if (/^#{1,6}\s+.*breaking changes?/i.test(line.trim())) {
      active = true;
      continue;
    }
    if (active && /^#{1,6}\s+/.test(line.trim())) break;
    if (active && /^\s*[-*]\s+/.test(line)) results.push(line.replace(/^\s*[-*]\s+/, '').trim());
  }
  return results.slice(0, 30);
}

function installationMethod(projectRoot: string): UpdateStatus['installMethod'] {
  const root = resolve(projectRoot);
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) return 'workspace';
  if (existsSync(join(root, '.git'))) return 'git-checkout';
  if (process.env.npm_config_global === 'true' || /[\\/]npm[\\/]node_modules[\\/]/i.test(root))
    return 'npm-global';
  return 'unknown';
}

function validateRepository(value: string): string {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value))
    throw new Error('Invalid GitHub repository name.');
  return value;
}

export async function checkForUpdates(
  options: {
    currentVersion?: string;
    repository?: string;
    channel?: 'stable' | 'prerelease';
    projectRoot?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<UpdateStatus> {
  const currentVersion = options.currentVersion ?? CODINFY_MONITOR_VERSION;
  const repository = validateRepository(options.repository ?? CODINFY_RELEASE_REPOSITORY);
  const channel = options.channel ?? 'stable';
  const projectRoot = options.projectRoot ?? process.cwd();
  const base: Omit<UpdateStatus, 'comparison' | 'updateAvailable'> = {
    checkedAt: new Date().toISOString(),
    currentVersion,
    channel,
    repository,
    installMethod: installationMethod(projectRoot),
    autoInstall: false,
    requiresConfirmation: true,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    const endpoint =
      channel === 'stable'
        ? `https://api.github.com/repos/${repository}/releases/latest`
        : `https://api.github.com/repos/${repository}/releases?per_page=20`;
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(endpoint, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'codinfy-agent-monitor',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`GitHub release API returned HTTP ${response.status}.`);
    const payload = (await response.json()) as
      Record<string, unknown> | Array<Record<string, unknown>>;
    const entries = Array.isArray(payload) ? payload : [payload];
    const selected = entries.find(
      (item) => item.draft !== true && (channel === 'prerelease' || item.prerelease !== true),
    );
    if (!selected) throw new Error('No compatible published release was returned by GitHub.');
    const version = String(selected.tag_name ?? '').replace(/^v/, '');
    const notes = redactSecrets(String(selected.body ?? '')).slice(0, 50_000);
    const comparison = compareSemanticVersions(currentVersion, version);
    const relation: UpdateStatus['comparison'] =
      comparison === null
        ? 'unknown'
        : comparison < 0
          ? 'older'
          : comparison > 0
            ? 'newer'
            : 'current';
    return {
      ...base,
      latestVersion: version,
      updateAvailable: relation === 'older',
      comparison: relation,
      release: {
        version,
        name: redactSecrets(String(selected.name ?? selected.tag_name ?? `v${version}`)).slice(
          0,
          500,
        ),
        notes,
        url: String(selected.html_url ?? `https://github.com/${repository}/releases`),
        publishedAt: typeof selected.published_at === 'string' ? selected.published_at : undefined,
        prerelease: selected.prerelease === true,
        draft: selected.draft === true,
        breakingChanges: breakingChanges(notes),
      },
    };
  } catch (error) {
    return {
      ...base,
      updateAvailable: false,
      comparison: 'unknown',
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
    };
  }
}

export function updatePreflight(projectRoot = process.cwd(), backupReady = false): UpdatePreflight {
  const git = getGitSummary(projectRoot);
  const secrets = scanSecrets(projectRoot);
  const attribution =
    existsSync(join(projectRoot, 'ATTRIBUTION.md')) && existsSync(join(projectRoot, 'NOTICE.md'));
  const checks: UpdatePreflight['checks'] = [
    {
      id: 'version',
      status: parseSemanticVersion(CODINFY_MONITOR_VERSION) ? 'passed' : 'failed',
      message: `Current version: ${CODINFY_MONITOR_VERSION}`,
    },
    {
      id: 'git',
      status: !git.available ? 'warning' : git.files.length ? 'warning' : 'passed',
      message: !git.available
        ? 'Git metadata is unavailable.'
        : git.files.length
          ? `${git.files.length} uncommitted file(s).`
          : 'Git working tree is clean.',
    },
    {
      id: 'secrets',
      status: secrets.length ? 'failed' : 'passed',
      message: secrets.length
        ? `${secrets.length} possible secret finding(s).`
        : 'No secret finding detected.',
    },
    {
      id: 'attribution',
      status: attribution ? 'passed' : 'failed',
      message: attribution
        ? 'NOTICE.md and ATTRIBUTION.md are present.'
        : 'Required attribution files are missing.',
    },
    {
      id: 'runtime',
      status: Number(process.versions.node.split('.')[0]) >= 22 ? 'passed' : 'failed',
      message: `Node.js ${process.versions.node}`,
    },
    {
      id: 'backup',
      status: backupReady ? 'passed' : 'warning',
      message: backupReady
        ? 'Configuration backup is ready.'
        : 'Create a configuration backup before installation.',
    },
  ];
  return {
    checkedAt: new Date().toISOString(),
    ready: checks.every((check) => check.status !== 'failed'),
    checks,
    requiresConfirmation: true,
  };
}

export function installNpmUpdate(input: {
  version: string;
  confirm: boolean;
  projectRoot?: string;
  allowDowngrade?: boolean;
}): UpdateExecutionResult {
  const version = input.version.replace(/^v/, '');
  if (input.confirm !== true)
    return {
      ok: false,
      status: 'refused',
      version,
      message: 'Explicit confirmation is required.',
      requiresConfirmation: true,
    };
  if (!parseSemanticVersion(version))
    return {
      ok: false,
      status: 'refused',
      version,
      message: 'A valid semantic version is required.',
      requiresConfirmation: true,
    };
  const projectRoot = input.projectRoot ?? process.cwd();
  const comparison = compareSemanticVersions(CODINFY_MONITOR_VERSION, version);
  if (comparison !== null && comparison >= 0 && input.allowDowngrade !== true)
    return {
      ok: false,
      status: 'refused',
      version,
      message: `Version ${version} is not newer than ${CODINFY_MONITOR_VERSION}. Use the explicit rollback flow for a downgrade.`,
      requiresConfirmation: true,
    };
  if (installationMethod(projectRoot) !== 'npm-global')
    return {
      ok: false,
      status: 'refused',
      version,
      message:
        'Automatic installation is supported only for npm-global installs. Use the documented manual Git/workspace upgrade steps.',
      requiresConfirmation: true,
    };
  const command = `npm install --global codinfy-agent-monitor@${version}`;
  try {
    const run = spawnTrusted('npm', ['install', '--global', `codinfy-agent-monitor@${version}`], {
      cwd: projectRoot,
      timeout: 300_000,
      env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
    });
    const output = redactSecrets(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim()).slice(-20_000);
    return {
      ok: run.status === 0,
      status: run.status === 0 ? 'installed' : 'failed',
      version,
      command,
      message:
        run.status === 0
          ? `Codinfy Agent Monitor ${version} installed.`
          : 'npm installation failed.',
      output,
      requiresConfirmation: true,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      version,
      command,
      message: redactSecrets(error instanceof Error ? error.message : String(error)),
      requiresConfirmation: true,
    };
  }
}
