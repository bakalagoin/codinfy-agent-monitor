# Installation

## Source installation

```bash
git clone https://github.com/bakalagoin/codinfy-agent-monitor.git
cd codinfy-agent-monitor
corepack enable
pnpm install
pnpm build
pnpm --filter codinfy-agent-monitor link --global
codinfy-agent-monitor init
```

Node.js 22.13+ is required for the built-in cross-platform SQLite store. Verify with `codinfy-agent-monitor doctor`.

## AI tool templates

Copy one matching directory from `templates/` into the monitored project. The tool launches `codinfy-agent-monitor mcp` and exposes MCP `codinfy-agent-monitor`. If a slash command is supported, `/codinfy` maps to the monitor tools. Restart the AI client after changing MCP configuration.

## Local fallback

```bash
codinfy-agent-monitor status
codinfy-agent-monitor watch
codinfy-agent-monitor web
```

The official dashboard route is local at `http://localhost:3579/codinfy`; `/dashboard` and `/codinfy-agent-monitor` are aliases.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
