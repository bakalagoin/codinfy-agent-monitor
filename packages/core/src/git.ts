import { execFileSync } from 'node:child_process';
import type { GitSummary } from './types.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
  }).trimEnd();
}

export function getGitSummary(cwd: string): GitSummary {
  try {
    const branch = git(cwd, ['branch', '--show-current']) || 'detached';
    const lines = git(cwd, ['status', '--porcelain=v1']).split(/\r?\n/).filter(Boolean);
    const summary: GitSummary = {
      available: true,
      branch,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
      files: [],
    };
    for (const line of lines) {
      const code = line.slice(0, 2);
      const file = line.slice(3).trim();
      summary.files.push(file);
      if (code === '??') summary.untracked += 1;
      else {
        if (code.includes('A')) summary.added += 1;
        if (code.includes('M')) summary.modified += 1;
        if (code.includes('D')) summary.deleted += 1;
        if (code.includes('R')) summary.renamed += 1;
      }
    }
    try {
      summary.remote = git(cwd, ['remote', 'get-url', 'origin']);
    } catch {
      /* no remote yet */
    }
    try {
      summary.lastCommit = git(cwd, ['log', '-1', '--pretty=%h %s (%cr)']);
    } catch {
      /* no commit yet */
    }
    return summary;
  } catch (error) {
    return {
      available: false,
      branch: 'none',
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
      files: [],
      error: error instanceof Error ? error.message : 'Git unavailable',
    };
  }
}
