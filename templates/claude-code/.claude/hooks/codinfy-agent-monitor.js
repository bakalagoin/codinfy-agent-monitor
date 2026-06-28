#!/usr/bin/env node
import { spawn } from 'node:child_process';

// Safe generic hook: records only the hook name, never the raw prompt or tool payload.
const event = process.env.CLAUDE_HOOK_EVENT ?? process.argv[2] ?? 'claude.hook';
const child = spawn('codinfy-agent-monitor', ['event', event, 'Claude Code event received'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  shell: process.platform === 'win32',
  detached: process.platform !== 'win32',
});
child.unref();
