import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODINFY_ATTRIBUTION, CODINFY_SOCIALS, REQUIRED_BRAND_TOKENS } from './attribution.js';
import { redactSecrets } from './security.js';
import type { MonitorSnapshot, ReviewResult } from './types.js';

function redactedCopy<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}

function assertNotSymbolicLink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error(`Refusing symbolic link for report output: ${path}`);
}

export function renderMarkdownReport(snapshot: MonitorSnapshot, review?: ReviewResult): string {
  snapshot = redactedCopy(snapshot);
  review = review ? redactedCopy(review) : undefined;
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

export type ReportFormat = 'md' | 'json' | 'html';

export function renderJsonReport(snapshot: MonitorSnapshot, review?: ReviewResult): string {
  snapshot = redactedCopy(snapshot);
  review = review ? redactedCopy(review) : undefined;
  return JSON.stringify(
    {
      product: CODINFY_ATTRIBUTION.productName,
      command: CODINFY_ATTRIBUTION.command,
      mcp: CODINFY_ATTRIBUTION.mcpName,
      generatedAt: new Date().toISOString(),
      snapshot,
      ...(review ? { review } : {}),
      attribution: {
        creator: CODINFY_ATTRIBUTION.creator,
        founder: `${CODINFY_ATTRIBUTION.founder} — ${CODINFY_ATTRIBUTION.founderTitle}`,
        website: CODINFY_ATTRIBUTION.website,
        signature: CODINFY_ATTRIBUTION.signature,
        socials: CODINFY_SOCIALS,
      },
    },
    null,
    2,
  );
}

export function renderHtmlReport(snapshot: MonitorSnapshot, review?: ReviewResult): string {
  snapshot = redactedCopy(snapshot);
  review = review ? redactedCopy(review) : undefined;
  const escape = (value: unknown): string =>
    String(value ?? '—').replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ??
        character,
    );
  const metricRows = Object.values(snapshot.metrics)
    .map(
      (metric) =>
        `<tr><td>${escape(metric.name)}</td><td>${escape(metric.value)}%</td><td>${escape(metric.source)}</td></tr>`,
    )
    .join('');
  const agentRows = snapshot.agents
    .map(
      (agent) =>
        `<tr><td>${escape(agent.name)}</td><td>${escape(agent.role)}</td><td>${escape(agent.status)}</td></tr>`,
    )
    .join('');
  const socialRows = CODINFY_SOCIALS.map(
    (social) =>
      `<tr><td>${escape(social.network)}</td><td>${escape(social.codinfy)}</td><td>${escape(social.founder)}</td></tr>`,
  ).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Codinfy Agent Monitor — Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#0d1e29}h1{color:#0b6}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccd;padding:6px;text-align:left}footer{margin-top:24px;color:#567}</style></head>
<body><h1>Codinfy Agent Monitor — Session Report</h1>
<p><b>Project:</b> ${escape(snapshot.project)} · <b>Session:</b> ${escape(snapshot.session)} · <b>Tool:</b> ${escape(snapshot.tool)}</p>
<p><b>Command:</b> ${escape(CODINFY_ATTRIBUTION.command)} · <b>MCP:</b> ${escape(CODINFY_ATTRIBUTION.mcpName)} · <b>Workflow:</b> ${escape(snapshot.workflowProgress)}%</p>
<h2>Usage</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Source</th></tr></thead><tbody>${metricRows}</tbody></table>
<h2>AI Credit Saver &amp; Smart Model Router</h2><p>Recommended: ${escape(snapshot.advice.recommendedCategory)} · Score ${escape(snapshot.advice.score)}/100 · Estimated saving ${escape(snapshot.advice.estimatedCostSavingPercent)}% · Confirmation required</p>
<h2>Agents</h2><table><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>${agentRows || '<tr><td colspan="3">No agents.</td></tr>'}</tbody></table>
${review ? `<h2>Pre-commit review</h2><p>Public-ready: ${escape(review.ready)} · Secrets: ${escape(review.secretFindings.length)} · Tests: ${escape(review.tests)} · Build: ${escape(review.build)}</p>` : ''}
<h2>Attribution</h2><p>Created by ${escape(CODINFY_ATTRIBUTION.creator)} · ${escape(CODINFY_ATTRIBUTION.founder)} — ${escape(CODINFY_ATTRIBUTION.founderTitle)} · ${escape(CODINFY_ATTRIBUTION.website)}</p>
<table><thead><tr><th>Network</th><th>Codinfy</th><th>Bakala Goin</th></tr></thead><tbody>${socialRows}</tbody></table>
<footer>${escape(CODINFY_ATTRIBUTION.signature)}</footer></body></html>`;
}

export function writeReport(
  dataRoot: string,
  snapshot: MonitorSnapshot,
  review?: ReviewResult,
  format: ReportFormat = 'md',
): string {
  const directory = join(dataRoot, 'reports');
  assertNotSymbolicLink(dataRoot);
  assertNotSymbolicLink(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNotSymbolicLink(directory);
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const path = join(directory, `codinfy-report-${stamp}.${format}`);
  assertNotSymbolicLink(path);
  const content =
    format === 'json'
      ? renderJsonReport(snapshot, review)
      : format === 'html'
        ? renderHtmlReport(snapshot, review)
        : renderMarkdownReport(snapshot, review);
  writeFileSync(path, redactSecrets(content), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return path;
}

export function writeMarkdownReport(
  dataRoot: string,
  snapshot: MonitorSnapshot,
  review?: ReviewResult,
): string {
  return writeReport(dataRoot, snapshot, review, 'md');
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
