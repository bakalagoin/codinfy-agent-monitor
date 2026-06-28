import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODINFY_ATTRIBUTION, CODINFY_SOCIALS, REQUIRED_BRAND_TOKENS } from './attribution.js';
import type { MonitorSnapshot, ReviewResult } from './types.js';

export function renderMarkdownReport(snapshot: MonitorSnapshot, review?: ReviewResult): string {
  const agents = snapshot.agents.length
    ? snapshot.agents
        .map(
          (agent) => `| ${agent.name} | ${agent.role} | ${agent.status} | ${agent.task ?? '—'} |`,
        )
        .join('\n')
    : '| — | — | idle | — |';
  const timeline = snapshot.timeline.length
    ? snapshot.timeline
        .map((event) => `- ${event.createdAt} — **${event.type}**: ${event.message}`)
        .join('\n')
    : '- No activity recorded.';
  const security = review
    ? `- Public-ready: ${review.ready ? 'yes' : 'no'}\n- Secret findings: ${review.secretFindings.length}\n- Tests: ${review.tests}\n- Build: ${review.build}`
    : '- Run `codinfy-agent-monitor review` for the pre-commit review.';
  return `# Codinfy Agent Monitor — Session Report

> ${CODINFY_ATTRIBUTION.signature}

## Overview

- Project: ${snapshot.project}
- Session: ${snapshot.session}
- Active tool: ${snapshot.tool}
- Command: ${CODINFY_ATTRIBUTION.command}
- MCP: ${CODINFY_ATTRIBUTION.mcpName}
- Workflow: ${snapshot.workflowProgress}%
- Estimate mode: ${snapshot.estimateMode ? 'enabled' : 'disabled'}

## Usage

| Metric | Value | Source |
|---|---:|---|
| Context | ${snapshot.metrics.context.value}% | ${snapshot.metrics.context.source} |
| Current rate | ${snapshot.metrics.rate.value}% | ${snapshot.metrics.rate.source} |
| Daily | ${snapshot.metrics.daily.value}% | ${snapshot.metrics.daily.source} |
| Weekly | ${snapshot.metrics.weekly.value}% | ${snapshot.metrics.weekly.source} |

## AI Credit Saver & Smart Model Router

- Current model: ${snapshot.currentModel}
- Recommended category: ${snapshot.advice.recommendedCategory}
- Model Need Score: ${snapshot.advice.score}/100
- Estimated cost saving: ${snapshot.advice.estimatedCostSavingPercent}%
- Model changes always require confirmation.

## Agents

| Agent | Role | Status | Task |
|---|---|---|---|
${agents}

## Git and pre-commit review

- Branch: ${snapshot.git.branch}
- Changed files: ${snapshot.git.files.length}
${security}

## Timeline

${timeline}

## Attribution

Created by CODINFY PLATFORMS SASU
Founder & CEO: Bakala Goin
Website: codinfy.com
Official command: /codinfy
Official MCP: codinfy-agent-monitor

| Network | Codinfy | Bakala Goin (Founder & CEO) |
|---|---|---|
${CODINFY_SOCIALS.map((social) => `| ${social.network} | ${social.codinfy} | ${social.founder} |`).join('\n')}

${CODINFY_ATTRIBUTION.signature}
`;
}

export function writeMarkdownReport(
  dataRoot: string,
  snapshot: MonitorSnapshot,
  review?: ReviewResult,
): string {
  const directory = join(dataRoot, 'reports');
  mkdirSync(directory, { recursive: true });
  const filename = `codinfy-report-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.md`;
  const path = join(directory, filename);
  writeFileSync(path, renderMarkdownReport(snapshot, review), 'utf8');
  return path;
}

export function checkAttribution(root: string): Record<string, string[]> {
  const requiredFiles = ['README.md', 'LICENSE', 'NOTICE.md', 'ATTRIBUTION.md'];
  const missing: Record<string, string[]> = {};
  for (const file of requiredFiles) {
    try {
      const content = readFileSync(join(root, file), 'utf8');
      const absent = REQUIRED_BRAND_TOKENS.filter((token) => !content.includes(token));
      for (const social of CODINFY_SOCIALS) {
        if (social.codinfy !== '—' && !content.includes(social.codinfy))
          absent.push(social.codinfy);
        if (!content.includes(social.founder)) absent.push(social.founder);
      }
      if (absent.length) missing[file] = [...new Set(absent)];
    } catch {
      missing[file] = ['file missing'];
    }
  }
  return missing;
}
