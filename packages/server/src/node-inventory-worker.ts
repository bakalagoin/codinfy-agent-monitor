import { parentPort, workerData } from 'node:worker_threads';
import { scanNodeServers } from '@codinfy/agent-monitor-core';

const data = workerData as { projectRoot: string };

try {
  parentPort?.postMessage({ ok: true, report: scanNodeServers(data.projectRoot) });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
