import { CODINFY_ATTRIBUTION } from '@codinfy/agent-monitor-core';
export const codexAdapter = Object.freeze({
  name: 'Codex',
  command: CODINFY_ATTRIBUTION.command,
  templateRoot: 'templates/codex',
  configFile: '.codex/config.toml',
  mcp: { command: 'codinfy-agent-monitor', args: ['mcp'] },
  signature: CODINFY_ATTRIBUTION.signature,
});
