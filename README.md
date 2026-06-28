# Codinfy Agent Monitor

> Real-time AI agent monitoring for Claude Code, Codex, Cursor and MCP workflows.

**Codinfy Agent Monitor** is a local-first TypeScript/Node.js MCP server, CLI, animated terminal UI, and local web dashboard for observing agents, context, usage limits, workflows, files, Git, tests, builds, errors, blockers, secrets, pre-commit readiness, and model-economy advice.

- Official command: `/codinfy`
- CLI: `codinfy-agent-monitor`
- MCP: `codinfy-agent-monitor`
- Local dashboard: `http://localhost:3579/dashboard`
- Data stays under `.codinfy-agent-monitor/` by default.

## What V1 monitors

- active, idle, thinking, running, reading, writing, done, error, and blocked agents;
- context, current rate, daily usage, and weekly usage, with `official` or `estimated` provenance;
- tasks, workflow progress, timeline, recent files, Git status, tests, and builds;
- secret patterns and sensitive files without echoing secret values;
- attribution, public-ready status, and review before commit;
- Host / VPS / Shared / Docker / Localhost environment signals;
- automatic French/English display language and beginner/intermediate/expert level;
- AI Credit Saver & Smart Model Router recommendations using configurable categories, not hard-coded provider model names.

The router **never changes a model automatically**. Every model change requires user confirmation.

## Requirements

- Node.js 22.13 or newer (the local store uses the cross-platform built-in `node:sqlite` API)
- pnpm 10+
- Git (recommended)

## Install from source

```bash
git clone https://github.com/bakalagoin/codinfy-agent-monitor.git
cd codinfy-agent-monitor
corepack enable
pnpm install
pnpm build
pnpm --filter codinfy-agent-monitor link --global
codinfy-agent-monitor init
```

Without a global link:

```bash
pnpm codinfy status
pnpm codinfy watch
pnpm mcp
```

## Quick start

```bash
codinfy-agent-monitor init
codinfy-agent-monitor status
codinfy-agent-monitor watch
codinfy-agent-monitor web
```

The animated TUI refreshes SQLite, Git, agents, usage, workflow, and the timeline. Press `r` to refresh or `q` to quit.

## Main CLI commands

```txt
codinfy-agent-monitor status       codinfy-agent-monitor agents
codinfy-agent-monitor context      codinfy-agent-monitor limits
codinfy-agent-monitor workflow     codinfy-agent-monitor timeline
codinfy-agent-monitor files        codinfy-agent-monitor git
codinfy-agent-monitor tests --run  codinfy-agent-monitor build --run
codinfy-agent-monitor secrets      codinfy-agent-monitor review
codinfy-agent-monitor saver        codinfy-agent-monitor budget
codinfy-agent-monitor model-advice codinfy-agent-monitor environment
codinfy-agent-monitor export       codinfy-agent-monitor about
codinfy-agent-monitor web          codinfy-agent-monitor mcp
```

Adapters can feed safe, normalized data:

```bash
codinfy-agent-monitor metric context 68 --source official
codinfy-agent-monitor metric daily 81 --source estimated
codinfy-agent-monitor event agent.reading "Documentation Agent is reading README.md"
```

If a provider does not expose its exact limits, Codinfy Agent Monitor displays **Mode estimation enabled**. It does not present guessed usage as official provider data.

## `/codinfy`

Ready-to-copy templates live in:

- `templates/claude-code/.claude/commands/codinfy.md`
- `templates/codex/.codex/`
- `templates/cursor/.cursor/`
- `templates/windsurf/.windsurf/`

Copy the matching template into a project after building or globally installing the CLI. In tools without custom slash commands, use the universal fallback:

```bash
codinfy-agent-monitor status
codinfy-agent-monitor watch
codinfy-agent-monitor web
```

## MCP configuration

The local stdio server command is:

```bash
codinfy-agent-monitor mcp
```

Generic configuration:

```json
{
  "mcpServers": {
    "codinfy-agent-monitor": {
      "command": "codinfy-agent-monitor",
      "args": ["mcp"]
    }
  }
}
```

V1 exposes 30 MCP tools, including `monitor.status`, `monitor.list_agents`, `monitor.register_agent`, `monitor.update_agent_state`, all four usage views, Smart Model Router advice, workflow/task tools, timeline, alerts, Git, secrets, pre-commit review, tests, build, environment, attribution, and report export. See [docs/mcp.md](docs/mcp.md).

## Local data and privacy

The monitor creates:

```txt
.codinfy-agent-monitor/
├── config.json
├── metrics.sqlite
├── sessions/
├── agents/
├── workflows/
├── logs/
├── reports/
└── cache/
```

This directory, `.env*`, logs, build output, and credentials are ignored by Git. The scanner redacts common API keys, GitHub tokens, bearer tokens, private keys, passwords, secrets, and connection URLs. No cloud account is required.

Before committing:

```bash
pnpm lint
pnpm test
pnpm build
pnpm format:check
codinfy-agent-monitor secrets
codinfy-agent-monitor review
git status --short
git diff --stat
```

## Monorepo

```txt
packages/core                 SQLite, agents, tasks, metrics, Git, security, router, reports
packages/cli                  codinfy-agent-monitor and codinfy-monitor binaries
packages/tui                  animated Ink terminal dashboard
packages/server               Fastify + WebSocket local dashboard
packages/mcp-server           stdio MCP codinfy-agent-monitor
packages/adapter-*            Claude Code, Codex, Cursor, Windsurf metadata
templates/                    /codinfy and MCP integration templates
docs/                         operator and developer documentation
```

## Development

```bash
corepack pnpm install
pnpm test
pnpm build
pnpm lint
pnpm format:check
```

Node, Windows, macOS, and Linux paths are handled with Node platform APIs. The dashboard binds to `127.0.0.1` by default.

## License and attribution

The repository is publicly readable and contribution-friendly under the custom [Codinfy Agent Monitor Attribution License](LICENSE). It includes brand, attribution, and product-identity obligations and may be classified as **source-available rather than OSI open source**. The legal prompt explicitly recommends counsel review before relying on it as a final legal instrument.

The following identity must remain present in copies, forks, distributions, interfaces, reports, exports, and modified versions:

```txt
Codinfy Agent Monitor
/codinfy
codinfy-agent-monitor
© CODINFY PLATFORMS SASU
codinfy.com
Created by CODINFY PLATFORMS SASU
Bakala Goin — Founder & CEO
```

## Connect with us

| Network     | Codinfy           | Bakala Goin (Founder & CEO) |
| ----------- | ----------------- | --------------------------- |
| Facebook    | @codinfyci        | @bakalagoin                 |
| Instagram   | @codinfyci        | @bakalagoin                 |
| LinkedIn    | company/codinfyen | bakala-goin                 |
| TikTok      | —                 | @bakalagoin                 |
| X (Twitter) | —                 | @bakalagoin                 |

Created by **CODINFY PLATFORMS SASU**
**Bakala Goin — Founder & CEO**
Website: **codinfy.com**

© CODINFY PLATFORMS SASU · codinfy.com
