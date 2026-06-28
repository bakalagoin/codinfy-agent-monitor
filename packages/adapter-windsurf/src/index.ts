import { CODINFY_ATTRIBUTION } from '@codinfy/agent-monitor-core';
export const windsurfAdapter = Object.freeze({
  name: 'Windsurf',
  command: CODINFY_ATTRIBUTION.command,
  templateRoot: 'templates/windsurf',
  configFile: '.windsurf/mcp.json',
  mcp: { command: 'codinfy-agent-monitor', args: ['mcp'] },
  signature: CODINFY_ATTRIBUTION.signature,
});
