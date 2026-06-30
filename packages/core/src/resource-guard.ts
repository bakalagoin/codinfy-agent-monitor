import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { scanNodeServers, type NodeRisk, type NodeServerReport } from './node-monitor.js';

export interface ProjectProcessGroup {
  project: string;
  workingDirectory?: string;
  pids: number[];
  ports: number[];
  frameworks: string[];
  memoryBytes: number;
  maxCpuPercent: number;
  risk: NodeRisk;
  protected: boolean;
}

export interface ProjectProcessMap {
  generatedAt: string;
  projects: ProjectProcessGroup[];
  unassignedPids: number[];
  relationships: Array<{ parentPid: number; childPid: number; sameProject: boolean }>;
}

export interface ResourceGuardReport {
  generatedAt: string;
  system: {
    cpuCount: number;
    loadAverage: [number, number, number];
    memoryTotalBytes: number;
    memoryUsedBytes: number;
    memoryUsedPercent: number;
  };
  node: {
    processCount: number;
    cpuPercent: number;
    memoryBytes: number;
    highRiskPids: number[];
  };
  thresholds: {
    processCpuWarningPercent: number;
    processMemoryWarningBytes: number;
    systemMemoryWarningPercent: number;
  };
  status: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
  source: 'live';
}

const riskRank: Record<NodeRisk, number> = { low: 0, medium: 1, high: 2, protected: 0 };

function highestRisk(values: NodeRisk[]): NodeRisk {
  return values.reduce<NodeRisk>(
    (highest, value) => (riskRank[value] > riskRank[highest] ? value : highest),
    'low',
  );
}

export function buildProjectProcessMap(report: NodeServerReport): ProjectProcessMap {
  const groups = new Map<string, ProjectProcessGroup>();
  for (const process of report.processes.filter((item) => item.project !== 'Unknown project')) {
    const current = groups.get(process.project) ?? {
      project: process.project,
      workingDirectory: process.workingDirectory,
      pids: [],
      ports: [],
      frameworks: [],
      memoryBytes: 0,
      maxCpuPercent: 0,
      risk: 'low' as NodeRisk,
      protected: false,
    };
    current.pids.push(process.pid);
    current.ports.push(...process.ports.map((port) => port.port));
    current.frameworks.push(process.framework);
    current.memoryBytes += process.memoryBytes ?? 0;
    current.maxCpuPercent = Math.max(current.maxCpuPercent, process.cpuPercent ?? 0);
    current.risk = highestRisk([current.risk, process.risk]);
    current.protected ||= process.protected;
    groups.set(process.project, current);
  }
  const byPid = new Map(report.processes.map((item) => [item.pid, item]));
  return {
    generatedAt: report.generatedAt,
    projects: [...groups.values()]
      .map((group) => ({
        ...group,
        pids: [...new Set(group.pids)].sort((left, right) => left - right),
        ports: [...new Set(group.ports)].sort((left, right) => left - right),
        frameworks: [...new Set(group.frameworks)].sort(),
      }))
      .sort((left, right) => left.project.localeCompare(right.project)),
    unassignedPids: report.processes
      .filter((item) => item.project === 'Unknown project')
      .map((item) => item.pid),
    relationships: report.processes
      .filter((item) => byPid.has(item.ppid))
      .map((item) => ({
        parentPid: item.ppid,
        childPid: item.pid,
        sameProject: byPid.get(item.ppid)?.project === item.project,
      })),
  };
}

export function getProjectProcessMap(projectRoot = process.cwd()): ProjectProcessMap {
  return buildProjectProcessMap(scanNodeServers(projectRoot));
}

export function buildResourceGuard(report: NodeServerReport): ResourceGuardReport {
  const memoryTotalBytes = totalmem();
  const memoryUsedBytes = memoryTotalBytes - freemem();
  const memoryUsedPercent = memoryTotalBytes
    ? Math.round((memoryUsedBytes / memoryTotalBytes) * 1_000) / 10
    : 0;
  const nodeCpu = report.processes.reduce((sum, item) => sum + (item.cpuPercent ?? 0), 0);
  const nodeMemory = report.processes.reduce((sum, item) => sum + (item.memoryBytes ?? 0), 0);
  const highRiskPids = report.processes
    .filter((item) => item.risk === 'high')
    .map((item) => item.pid);
  const recommendations: string[] = [];
  if (memoryUsedPercent >= 85)
    recommendations.push('System memory is above 85%; inspect the largest process before acting.');
  if (highRiskPids.length)
    recommendations.push(
      `Inspect high-risk Node process${highRiskPids.length > 1 ? 'es' : ''}: ${highRiskPids.join(', ')}.`,
    );
  if (report.totals.orphans)
    recommendations.push(
      'Review orphan candidates. Cleanup always requires explicit confirmation.',
    );
  if (!recommendations.length)
    recommendations.push('Resources are within the default safety thresholds.');
  const status =
    memoryUsedPercent >= 95 || highRiskPids.length >= 3
      ? 'critical'
      : memoryUsedPercent >= 85 || highRiskPids.length > 0
        ? 'warning'
        : 'healthy';
  return {
    generatedAt: report.generatedAt,
    system: {
      cpuCount: cpus().length,
      loadAverage: loadavg() as [number, number, number],
      memoryTotalBytes,
      memoryUsedBytes,
      memoryUsedPercent,
    },
    node: {
      processCount: report.processes.length,
      cpuPercent: Math.round(nodeCpu * 100) / 100,
      memoryBytes: nodeMemory,
      highRiskPids,
    },
    thresholds: {
      processCpuWarningPercent: 85,
      processMemoryWarningBytes: 2_147_483_648,
      systemMemoryWarningPercent: 85,
    },
    status,
    recommendations,
    source: 'live',
  };
}

export function getResourceGuard(projectRoot = process.cwd()): ResourceGuardReport {
  return buildResourceGuard(scanNodeServers(projectRoot));
}
