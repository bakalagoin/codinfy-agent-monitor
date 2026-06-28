# Architecture

Codinfy Agent Monitor is a Node.js/TypeScript monorepo with one local state model shared by every interface.

```txt
AI tool / adapter ──┐
CLI /codinfy ───────┼──> @codinfy/agent-monitor-core ──> node:sqlite
MCP stdio ──────────┤              │
Ink TUI ────────────┤              ├── Git + environment (read-only)
Fastify/WebSocket ──┘              ├── secret scanner + pre-commit review
                                   └── reports + Smart Model Router
```

The core owns validation, SQLite migrations, redaction, provenance, agent/task state, workflows, model categories, and attribution. Interfaces do not maintain parallel state. SQLite uses WAL mode so the MCP server, TUI, and dashboard can observe the same local project.

Packages:

- `@codinfy/agent-monitor-core`: domain and storage;
- `codinfy-agent-monitor`: CLI and `/codinfy` fallback;
- `@codinfy/agent-monitor-tui`: animated Ink UI;
- `@codinfy/agent-monitor-server`: local Fastify/WebSocket dashboard;
- `@codinfy/agent-monitor-mcp`: stdio MCP `codinfy-agent-monitor`;
- `@codinfy/agent-monitor-adapter-*`: template metadata for supported AI tools.

The dashboard binds to loopback. The MCP uses stdio. Provider usage is `official` only when an adapter explicitly records official data; otherwise it is `estimated`.

© CODINFY PLATFORMS SASU · codinfy.com
