import { CODINFY_ATTRIBUTION } from '@codinfy/agent-monitor-core';
export const cursorAdapter = Object.freeze({
  name: 'Cursor',
  command: CODINFY_ATTRIBUTION.command,
  templateRoot: 'templates/cursor',
  configFile: '.cursor/mcp.json',
  mcp: { command: 'codinfy-agent-monitor', args: ['mcp'] },
  signature: CODINFY_ATTRIBUTION.signature,
});
