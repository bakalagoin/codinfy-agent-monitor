#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join, relative, resolve } from 'node:path';

// Safe generic hook: records only the hook name, never the raw prompt or tool payload.
const allowedEvents = new Set([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'claude.hook',
]);
const requestedEvent = process.env.CLAUDE_HOOK_EVENT ?? process.argv[2] ?? 'claude.hook';
const event = allowedEvents.has(requestedEvent) ? requestedEvent : 'claude.hook';
const projectRoot = resolve(process.cwd());
const isWithinProject = (candidate) => {
  const path = relative(projectRoot, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
const extensions =
  process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
let binary;
for (const rawDirectory of (process.env.PATH ?? '').split(delimiter)) {
  const directory = rawDirectory.trim().replace(/^"|"$/g, '');
  if (!directory || !isAbsolute(directory)) continue;
  let realDirectory;
  try {
    realDirectory = realpathSync(directory);
  } catch {
    continue;
  }
  if (isWithinProject(realDirectory)) continue;
  for (const extension of extensions) {
    const candidate = join(realDirectory, `codinfy-agent-monitor${extension.toLowerCase()}`);
    try {
      if (statSync(candidate).isFile()) {
        const realCandidate = realpathSync(candidate);
        if (!isWithinProject(realCandidate)) binary = realCandidate;
      }
    } catch {
      /* keep searching trusted PATH entries */
    }
    if (binary) break;
  }
  if (binary) break;
}

if (!binary) process.exit(0);
const monitorArgs = ['event', event, 'Claude Code event received'];
const isBatch =
  process.platform === 'win32' && ['.cmd', '.bat'].includes(extname(binary).toLowerCase());
const command = isBatch
  ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
  : binary;
const args = isBatch
  ? ['/d', '/s', '/c', [`"${binary}"`, ...monitorArgs.map((value) => `"${value}"`)].join(' ')]
  : monitorArgs;
const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: 'ignore',
  shell: false,
  detached: process.platform !== 'win32',
});
child.unref();
