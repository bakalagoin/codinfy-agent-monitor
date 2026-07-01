import { existsSync, readlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import {
  execTrustedStaticPowerShell,
  resolveTrustedExecutable,
  spawnTrusted,
} from './execution.js';
import { redactSecrets } from './security.js';

export type NodeProcessStatus = 'running' | 'orphan' | 'protected';
export type NodeRisk = 'low' | 'medium' | 'high' | 'protected';

export interface NodePortBinding {
  address: string;
  port: number;
  pid: number;
  processName: string;
  protocol: 'tcp';
  public: boolean;
  isNode: boolean;
  protected: boolean;
}

export interface NodePortConflict {
  port: number;
  pids: number[];
  addresses: string[];
  severity: 'medium' | 'high';
  message: string;
}

export interface NodeServerProcess {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  executablePath?: string;
  workingDirectory?: string;
  framework: string;
  project: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  script?: string;
  ports: NodePortBinding[];
  cpuPercent?: number;
  memoryBytes?: number;
  uptimeSeconds?: number;
  startedAt?: string;
  status: NodeProcessStatus;
  risk: NodeRisk;
  protected: boolean;
  protectionReasons: string[];
  orphanReasons: string[];
  recommendation: string;
}

export interface NodeServerReport {
  generatedAt: string;
  platform: NodeJS.Platform;
  processes: NodeServerProcess[];
  ports: NodePortBinding[];
  conflicts: NodePortConflict[];
  totals: {
    active: number;
    protected: number;
    orphans: number;
    openPorts: number;
    conflicts: number;
  };
  warnings: string[];
  estimatedFields: string[];
}

export interface NodeInventoryProcess {
  pid: number;
  ppid?: number;
  name: string;
  command?: string;
  executablePath?: string;
  workingDirectory?: string;
  cpuPercent?: number;
  memoryBytes?: number;
  uptimeSeconds?: number;
  startedAt?: string;
}

export interface NodeInventoryInput {
  processes: NodeInventoryProcess[];
  listeners: Array<{
    address: string;
    port: number;
    pid: number;
    processName?: string;
  }>;
  warnings?: string[];
}

const WINDOWS_INVENTORY = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$node = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='bun.exe' OR Name='deno.exe'")
$nodeIds = @($node | ForEach-Object { [int]$_.ProcessId })
$listeners = @()
if ($nodeIds.Count -gt 0) {
  $listeners = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p TCP | ForEach-Object {
    $parts = @($_ -split '\s+' | Where-Object { $_ })
    if ($parts.Count -ge 5 -and $parts[0] -eq 'TCP' -and $parts[3] -match 'LISTEN|ECOUTE|ÉCOUTE') {
      $ownerPid = [int]$parts[4]
      $endpoint = [string]$parts[1]
      $endpointMatch = [regex]::Match($endpoint, '^(?<address>.+):(?<port>\d+)$')
      if (($nodeIds -contains $ownerPid) -and $endpointMatch.Success) {
        [pscustomobject]@{
          address = $endpointMatch.Groups['address'].Value.Trim('[', ']')
          port = [int]$endpointMatch.Groups['port'].Value
          pid = $ownerPid
        }
      }
    }
  })
}
$runtimes = @{}
foreach ($runtime in @(Get-Process -Id $nodeIds)) {
  $runtimes[[int]$runtime.Id] = $runtime
}
$cores = [Math]::Max(1, [Environment]::ProcessorCount)
$processes = @($node | ForEach-Object {
  $runtime = $runtimes[[int]$_.ProcessId]
  $cpu = $null
  $uptime = $null
  if ($runtime -and $runtime.StartTime) {
    $uptime = [Math]::Max(0.001, ((Get-Date) - $runtime.StartTime).TotalSeconds)
  }
  if ($runtime -and $uptime) {
    $cpu = [Math]::Round(([double]$runtime.CPU / $uptime / $cores) * 100, 2)
  }
  $started = $null
  if ($runtime -and $runtime.StartTime) { $started = $runtime.StartTime.ToUniversalTime().ToString('o') }
  [pscustomobject]@{
    pid = [int]$_.ProcessId
    ppid = [int]$_.ParentProcessId
    name = [string]$_.Name
    command = [string]$_.CommandLine
    executablePath = [string]$_.ExecutablePath
    cpuPercent = $cpu
    memoryBytes = if ($runtime) { [double]$runtime.WorkingSet64 } else { $null }
    startedAt = $started
    uptimeSeconds = if ($uptime) { [Math]::Round($uptime) } else { $null }
  }
})
$owners = @{}
foreach ($item in $node) {
  $owners[[int]$item.ProcessId] = [string]$item.Name
}
$outputListeners = @($listeners | ForEach-Object {
  [pscustomobject]@{
    address = $_.address
    port = $_.port
    pid = $_.pid
    processName = if ($owners.ContainsKey([int]$_.pid)) { $owners[[int]$_.pid] } else { 'unknown' }
  }
})
[pscustomobject]@{ processes = $processes; listeners = $outputListeners } | ConvertTo-Json -Depth 6 -Compress
`;

function arrayOf<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeCommand(value: string | undefined): string {
  if (!value) return '';
  return redactSecrets(value)
    .replace(
      /((?:--?|\/)(?:api[-_]?key|token|secret|password|passwd|authorization)(?:=|\s+))["']?[^\s"']+["']?/gi,
      '$1[REDACTED]',
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .slice(0, 4_000);
}

function publicAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return !['127.0.0.1', '::1', 'localhost'].includes(normalized) && !normalized.startsWith('127.');
}

function frameworkFor(command: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\bnext(?:\.js)?\b/i, 'Next.js'],
    [/\bnuxt(?:\.js)?\b/i, 'Nuxt'],
    [/\bvite\b/i, 'Vite'],
    [/\bnest(?:js)?\b/i, 'NestJS'],
    [/\bfastify\b/i, 'Fastify'],
    [/\bexpress\b/i, 'Express'],
    [/\bwebpack(?:-dev-server)?\b/i, 'Webpack'],
    [/\bastro\b/i, 'Astro'],
    [/\bremix\b/i, 'Remix'],
    [/\bsvelte-kit|\bsveltekit\b/i, 'SvelteKit'],
    [/\btsx\b/i, 'Node (tsx)'],
    [/--inspect(?:-brk)?\b/i, 'Node (inspect)'],
  ];
  return rules.find(([pattern]) => pattern.test(command))?.[1] ?? 'Node.js';
}

function packageManagerFor(command: string): NodeServerProcess['packageManager'] {
  if (/\bpnpm(?:\.c?js|\.cmd)?\b/i.test(command)) return 'pnpm';
  if (/\byarn(?:\.c?js|\.cmd)?\b/i.test(command)) return 'yarn';
  if (/\bbun(?:\.exe)?\b/i.test(command)) return 'bun';
  if (/\bnpm(?:-cli\.js|\.cmd)?\b/i.test(command)) return 'npm';
  return undefined;
}

function scriptFor(command: string): string | undefined {
  const match = command.match(/\b(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?([a-z0-9:_-]+)/i);
  return match?.[1];
}

function projectPathFor(input: NodeInventoryProcess, command: string): string | undefined {
  if (input.workingDirectory && isAbsolute(input.workingDirectory))
    return resolve(input.workingDirectory);
  const nodeModules = command.match(/([a-z]:\\[^"']+?|\/[^"']+?)node_modules[\\/]/i)?.[1];
  if (nodeModules) return resolve(nodeModules.replace(/[\\/]$/, ''));
  const quoted = [...command.matchAll(/["']([^"']+)["']/g)]
    .map((match) => match[1])
    .find(
      (candidate) =>
        candidate &&
        isAbsolute(candidate) &&
        /[\\/]/.test(candidate) &&
        !/^(?:node|bun|deno)(?:\.exe)?$/i.test(basename(candidate)) &&
        !/[\\/]nodejs[\\/](?:node|npm|npx)(?:\.exe|\.cmd)?$/i.test(candidate),
    );
  const unquotedScript = command.match(/\s((?:[a-z]:\\|\/)[^\s"']+\.[cm]?[jt]sx?)(?:\s|$)/i)?.[1];
  const candidate = quoted ?? unquotedScript;
  if (candidate) {
    const normalized = resolve(candidate);
    let directory = /\.[cm]?[jt]sx?$/i.test(normalized) ? dirname(normalized) : normalized;
    for (let level = 0; level < 8; level += 1) {
      if (existsSync(resolve(directory, 'package.json'))) return directory;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return /\.[cm]?[jt]sx?$/i.test(normalized) ? dirname(normalized) : normalized;
  }
  return undefined;
}

function isNodeRuntime(name: string): boolean {
  return /^(node|bun|deno)(\.exe)?$/i.test(name);
}

function isRecognizedServer(command: string): boolean {
  return /\b(vite|next|nuxt|nest|fastify|express|webpack-dev-server|astro|remix|svelte-kit|serve|dev|start|--inspect)\b/i.test(
    command,
  );
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function currentProcessFamily(): Set<number> {
  return new Set([process.pid, process.ppid].filter((pid) => pid > 0));
}

function recommendationFor(input: {
  protected: boolean;
  orphan: boolean;
  conflict: boolean;
  publicPort: boolean;
}): string {
  if (input.protected) return 'Protected process. Inspect only; do not stop automatically.';
  if (input.conflict) return 'Inspect every owner before resolving the port conflict.';
  if (input.orphan)
    return 'Review identity and impact, then stop gracefully only with confirmation.';
  if (input.publicPort) return 'Verify that public network exposure is intentional.';
  return 'Healthy process. Continue monitoring.';
}

export function analyzeNodeInventory(
  inventory: NodeInventoryInput,
  platform = process.platform,
): NodeServerReport {
  const warnings = [...(inventory.warnings ?? [])];
  const family = currentProcessFamily();
  const processNames = new Map(inventory.processes.map((item) => [item.pid, item.name]));
  const nodePids = new Set(
    inventory.processes.filter((item) => isNodeRuntime(item.name)).map((item) => item.pid),
  );
  const bindings: NodePortBinding[] = inventory.listeners
    .filter((item) => Number.isInteger(item.port) && item.port > 0 && item.port <= 65_535)
    .map((item) => {
      const processName = item.processName ?? processNames.get(item.pid) ?? 'unknown';
      const isNode = nodePids.has(item.pid) || isNodeRuntime(processName);
      const protectedPort = item.port === 3579;
      return {
        address: item.address || 'unknown',
        port: item.port,
        pid: item.pid,
        processName,
        protocol: 'tcp' as const,
        public: publicAddress(item.address || 'unknown'),
        isNode,
        protected: protectedPort || family.has(item.pid),
      };
    })
    .sort((left, right) => left.port - right.port || left.pid - right.pid);

  const groupedPorts = new Map<number, NodePortBinding[]>();
  for (const binding of bindings) {
    const group = groupedPorts.get(binding.port) ?? [];
    group.push(binding);
    groupedPorts.set(binding.port, group);
  }
  const conflicts: NodePortConflict[] = [];
  for (const [port, group] of groupedPorts) {
    const pids = [...new Set(group.map((item) => item.pid))];
    if (pids.length < 2) continue;
    conflicts.push({
      port,
      pids,
      addresses: [...new Set(group.map((item) => item.address))],
      severity: group.some((item) => item.public) ? 'high' : 'medium',
      message: `Port ${port} has ${pids.length} distinct listening process owners.`,
    });
  }

  const processes = inventory.processes
    .filter((item) => isNodeRuntime(item.name))
    .map((item): NodeServerProcess | null => {
      const command = sanitizeCommand(item.command);
      const ports = bindings.filter((binding) => binding.pid === item.pid);
      if (!ports.length && !isRecognizedServer(command)) return null;
      const workingDirectory = projectPathFor(item, command);
      const project = workingDirectory ? basename(workingDirectory) : 'Unknown project';
      const protectionReasons: string[] = [];
      if (family.has(item.pid)) protectionReasons.push('Codinfy runtime process family');
      if (ports.some((port) => port.port === 3579)) protectionReasons.push('Dashboard port 3579');
      if (
        /codinfy-agent-monitor|mcp-server|claude|cursor|codex|kapture|code(?:\.exe)?\b/i.test(
          command,
        )
      )
        protectionReasons.push('MCP, editor, or host integration');
      if (!command || project === 'Unknown project')
        protectionReasons.push('Process identity is incomplete');
      const protectedProcess = protectionReasons.length > 0;
      const orphanReasons: string[] = [];
      if (item.ppid && item.ppid > 0 && !processAlive(item.ppid))
        orphanReasons.push(`Parent process ${item.ppid} is no longer running`);
      if (workingDirectory && !existsSync(workingDirectory))
        orphanReasons.push('Detected project path no longer exists');
      const orphan = !protectedProcess && orphanReasons.length > 0;
      const conflict = ports.some((port) => conflicts.some((item) => item.port === port.port));
      const publicPort = ports.some((port) => port.public);
      const resourceRisk = (item.cpuPercent ?? 0) >= 85 || (item.memoryBytes ?? 0) >= 2_147_483_648;
      const risk: NodeRisk = protectedProcess
        ? 'protected'
        : orphan || conflict || resourceRisk
          ? 'high'
          : publicPort || (item.cpuPercent ?? 0) >= 60 || (item.memoryBytes ?? 0) >= 1_073_741_824
            ? 'medium'
            : 'low';
      return {
        pid: item.pid,
        ppid: item.ppid ?? 0,
        name: item.name,
        command,
        executablePath: item.executablePath,
        workingDirectory,
        framework: frameworkFor(command),
        project,
        packageManager: packageManagerFor(command),
        script: scriptFor(command),
        ports,
        cpuPercent: item.cpuPercent,
        memoryBytes: item.memoryBytes,
        uptimeSeconds: item.uptimeSeconds,
        startedAt: item.startedAt,
        status: protectedProcess ? 'protected' : orphan ? 'orphan' : 'running',
        risk,
        protected: protectedProcess,
        protectionReasons,
        orphanReasons,
        recommendation: recommendationFor({
          protected: protectedProcess,
          orphan,
          conflict,
          publicPort,
        }),
      };
    })
    .filter((item): item is NodeServerProcess => item !== null)
    .sort((left, right) => left.pid - right.pid);

  const protectedPids = new Set(processes.filter((item) => item.protected).map((item) => item.pid));
  const nodePorts = bindings
    .filter((binding) => nodePids.has(binding.pid))
    .map((binding) => ({
      ...binding,
      protected: binding.protected || protectedPids.has(binding.pid),
    }));
  return {
    generatedAt: new Date().toISOString(),
    platform,
    processes,
    ports: nodePorts,
    conflicts: conflicts.filter((conflict) => conflict.pids.some((pid) => nodePids.has(pid))),
    totals: {
      active: processes.length,
      protected: processes.filter((item) => item.protected).length,
      orphans: processes.filter((item) => item.status === 'orphan').length,
      openPorts: new Set(nodePorts.map((item) => item.port)).size,
      conflicts: conflicts.filter((conflict) => conflict.pids.some((pid) => nodePids.has(pid)))
        .length,
    },
    warnings,
    estimatedFields: platform === 'win32' ? ['workingDirectory', 'cpuPercent'] : [],
  };
}

function windowsInventory(projectRoot: string): NodeInventoryInput {
  const output = execTrustedStaticPowerShell(WINDOWS_INVENTORY, {
    cwd: projectRoot,
    timeout: 40_000,
  }).trim();
  if (!output)
    return { processes: [], listeners: [], warnings: ['Windows inventory returned no data.'] };
  const parsed = JSON.parse(output) as {
    processes?: NodeInventoryProcess | NodeInventoryProcess[];
    listeners?: NodeInventoryInput['listeners'][number] | NodeInventoryInput['listeners'];
  };
  return {
    processes: arrayOf(parsed.processes).map((item) => ({
      ...item,
      pid: Number(item.pid),
      ppid: numberOrUndefined(item.ppid),
      cpuPercent: numberOrUndefined(item.cpuPercent),
      memoryBytes: numberOrUndefined(item.memoryBytes),
      uptimeSeconds: numberOrUndefined(item.uptimeSeconds),
    })),
    listeners: arrayOf(parsed.listeners).map((item) => ({
      ...item,
      pid: Number(item.pid),
      port: Number(item.port),
    })),
  };
}

function elapsedSeconds(value: string): number | undefined {
  const parts = value.split('-');
  const day = parts.length === 2 ? Number(parts[0]) : 0;
  const clock = (parts.length === 2 ? parts[1] : parts[0])?.split(':').map(Number) ?? [];
  if (clock.some((part) => !Number.isFinite(part))) return undefined;
  const [hours, minutes, seconds] =
    clock.length === 3 ? clock : clock.length === 2 ? [0, ...clock] : [0, 0, ...clock];
  return day * 86_400 + (hours ?? 0) * 3_600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

function unixInventory(projectRoot: string): NodeInventoryInput {
  const warnings: string[] = [];
  const ps = spawnTrusted('ps', ['-axo', 'pid=,ppid=,etime=,pcpu=,rss=,comm=,args='], {
    cwd: projectRoot,
    timeout: 10_000,
  });
  if (ps.status !== 0) throw new Error('Unable to read the system process table.');
  const processes = String(ps.stdout)
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match): NodeInventoryProcess => {
      const pid = Number(match[1]);
      let workingDirectory: string | undefined;
      if (process.platform === 'linux') {
        try {
          workingDirectory = readlinkSync(`/proc/${pid}/cwd`);
        } catch {
          /* access can be denied for processes owned by another user */
        }
      }
      return {
        pid,
        ppid: Number(match[2]),
        uptimeSeconds: elapsedSeconds(match[3] ?? ''),
        cpuPercent: Number(match[4]),
        memoryBytes: Number(match[5]) * 1024,
        name: basename(match[6] ?? 'unknown'),
        command: match[7] ?? '',
        workingDirectory,
      };
    });

  const listeners: NodeInventoryInput['listeners'] = [];
  if (resolveTrustedExecutable('lsof', projectRoot)) {
    const run = spawnTrusted('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], {
      cwd: projectRoot,
      timeout: 10_000,
    });
    let pid = 0;
    let processName = 'unknown';
    for (const line of String(run.stdout).split(/\r?\n/)) {
      if (line.startsWith('p')) pid = Number(line.slice(1));
      else if (line.startsWith('c')) processName = line.slice(1) || 'unknown';
      else if (line.startsWith('n')) {
        const match = line.slice(1).match(/^(.*):(\d+)(?:\s|$)/);
        if (match && pid)
          listeners.push({
            address: match[1] ?? 'unknown',
            port: Number(match[2]),
            pid,
            processName,
          });
      }
    }
  } else {
    warnings.push('lsof is unavailable; listening-port ownership could not be mapped safely.');
  }
  return { processes, listeners, warnings };
}

export function scanNodeServers(projectRoot = process.cwd()): NodeServerReport {
  const root = resolve(projectRoot);
  try {
    const inventory = process.platform === 'win32' ? windowsInventory(root) : unixInventory(root);
    return analyzeNodeInventory(inventory);
  } catch (error) {
    return analyzeNodeInventory({
      processes: [],
      listeners: [],
      warnings: [
        `Node inventory failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      ],
    });
  }
}

export function inspectNodeProcess(
  pid: number,
  projectRoot = process.cwd(),
): NodeServerProcess | null {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('A positive process ID is required.');
  return scanNodeServers(projectRoot).processes.find((item) => item.pid === pid) ?? null;
}
