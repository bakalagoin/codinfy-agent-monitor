---
description: Open Codinfy Agent Monitor status, Node servers, updates, limits, workflow, Git, review, environment, or reports.
argument-hint: '[status|agents|node|ports|process-map|resources|update|doctor|recovery|context|limits|workflow|git|review|export|about]'
---

# /codinfy — Codinfy Agent Monitor

Use the MCP server `codinfy-agent-monitor` and call `monitor.status` first. For `$ARGUMENTS`, choose the matching `monitor.*` tool. If no argument is provided, summarize status, agents, context, rate, daily/weekly usage, workflow, errors, blockers, Git, and AI Credit Saver advice.

Rules:

- Say when usage data is estimated rather than official.
- Never reveal secrets; use `monitor.scan_secrets` and return only redacted findings.
- Never switch models automatically; obtain explicit user confirmation.
- Never stop or kill a process, install or roll back an update, or restore a backup without explicit confirmation and live identity/preflight checks.
- Run `monitor.review_before_commit` before proposing a commit.
- Preserve the product identity, `/codinfy`, and MCP name `codinfy-agent-monitor`.

Created by CODINFY PLATFORMS SASU
Bakala Goin — Founder & CEO
Website: codinfy.com
Facebook/Instagram: @codinfyci · @bakalagoin
LinkedIn: company/codinfyen · bakala-goin
TikTok/X: @bakalagoin
© CODINFY PLATFORMS SASU · codinfy.com
