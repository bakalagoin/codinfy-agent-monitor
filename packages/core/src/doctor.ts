import { accessSync, constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CODINFY_ATTRIBUTION } from './attribution.js';
import { scanNodeServers, type NodeServerReport } from './node-monitor.js';
import { CODINFY_MONITOR_VERSION } from './update-center.js';

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'passed' | 'warning' | 'failed';
  message: string;
  remediation?: string;
}

export interface HealthDoctorReport {
  checkedAt: string;
  version: string;
  status: 'healthy' | 'warning' | 'critical';
  checks: DoctorCheck[];
  attribution: typeof CODINFY_ATTRIBUTION;
}

export function runHealthDoctor(
  projectRoot: string,
  dataRoot: string,
  nodeReport?: NodeServerReport,
): HealthDoctorReport {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'runtime',
    label: 'Node.js runtime',
    status: nodeMajor >= 22 ? 'passed' : 'failed',
    message: `Node.js ${process.versions.node}`,
    remediation: nodeMajor >= 22 ? undefined : 'Install Node.js 22 or newer.',
  });
  try {
    accessSync(dataRoot, constants.R_OK | constants.W_OK);
    checks.push({ id: 'storage', label: 'Local storage', status: 'passed', message: dataRoot });
  } catch {
    checks.push({
      id: 'storage',
      label: 'Local storage',
      status: 'failed',
      message: 'Codinfy storage is not readable and writable.',
      remediation: 'Review directory ownership and permissions.',
    });
  }
  const attributionFiles = ['LICENSE', 'NOTICE.md', 'ATTRIBUTION.md'];
  const missing = attributionFiles.filter((file) => !existsSync(join(projectRoot, file)));
  checks.push({
    id: 'attribution',
    label: 'Identity and attribution',
    status: missing.length ? 'failed' : 'passed',
    message: missing.length
      ? `Missing: ${missing.join(', ')}`
      : 'Required attribution files are present.',
    remediation: missing.length ? 'Restore mandatory Codinfy attribution files.' : undefined,
  });
  const report = nodeReport ?? scanNodeServers(projectRoot);
  checks.push({
    id: 'process-inventory',
    label: 'Node process inventory',
    status: report.warnings.length ? 'warning' : 'passed',
    message: report.warnings[0] ?? `${report.totals.active} Node server(s) detected.`,
    remediation: report.warnings.length
      ? 'Review OS command availability and process permissions.'
      : undefined,
  });
  checks.push({
    id: 'dashboard-port',
    label: 'Dashboard port protection',
    status: report.ports.some((port) => port.port === 3579 && !port.protected)
      ? 'failed'
      : 'passed',
    message: report.ports.some((port) => port.port === 3579)
      ? 'Port 3579 is detected and protected.'
      : 'Port 3579 is currently not listening.',
  });
  const failed = checks.filter((check) => check.status === 'failed').length;
  const warned = checks.filter((check) => check.status === 'warning').length;
  return {
    checkedAt: new Date().toISOString(),
    version: CODINFY_MONITOR_VERSION,
    status: failed ? 'critical' : warned ? 'warning' : 'healthy',
    checks,
    attribution: CODINFY_ATTRIBUTION,
  };
}
