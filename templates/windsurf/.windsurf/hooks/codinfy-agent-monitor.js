#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join, relative, resolve } from 'node:path';

const allowedHosts = new Set(['claude', 'codex', 'windsurf']);
const allowedEvents = /^[a-z0-9_.-]{1,80}$/i;
const host = allowedHosts.has(process.argv[3]) ? process.argv[3] : 'windsurf';
const event = allowedEvents.test(process.argv[2] ?? '') ? process.argv[2] : 'Activity';
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
    for (const suffix of new Set([extension.toLowerCase(), extension.toUpperCase()])) {
      const candidate = join(realDirectory, `codinfy-agent-monitor${suffix}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        const realCandidate = realpathSync(candidate);
        if (!isWithinProject(realCandidate)) binary = realCandidate;
      } catch {
        // Keep searching trusted PATH entries.
      }
      if (binary) break;
    }
    if (binary) break;
  }
  if (binary) break;
}
if (binary) {
  const monitorArgs = ['adapter-event', host, event];
  const isBatch =
    process.platform === 'win32' && ['.cmd', '.bat'].includes(extname(binary).toLowerCase());
  if (isBatch) {
    const quoted = [binary, ...monitorArgs].map((value) => `"${value}"`).join(' ');
    spawnSync(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'),
      ['/d', '/s', '/c', `"${quoted}"`],
      {
        cwd: projectRoot,
        stdio: 'ignore',
        shell: false,
        timeout: 10_000,
        windowsVerbatimArguments: true,
      },
    );
  } else {
    spawnSync(binary, monitorArgs, {
      cwd: projectRoot,
      stdio: 'ignore',
      shell: false,
      timeout: 10_000,
    });
  }
}
process.exit(0);
