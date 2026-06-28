import { CODINFY_ATTRIBUTION } from '@codinfy/agent-monitor-core';
export const claudeCodeAdapter = Object.freeze({
  name: 'Claude Code',
  command: CODINFY_ATTRIBUTION.command,
  templateRoot: 'templates/claude-code',
  hooks: [
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
  ],
  mcp: { command: 'codinfy-agent-monitor', args: ['mcp'] },
  signature: CODINFY_ATTRIBUTION.signature,
});
