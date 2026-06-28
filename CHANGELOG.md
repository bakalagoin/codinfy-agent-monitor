# Changelog

## 0.1.1 — 2026-06-28

### Fixed

- Fixed root `pnpm check` order so `build` runs before the CLI tests, preventing failures on a clean clone where `dist/` does not yet exist.
- Extended `check` to also run the secret scanner and the attribution check, aligning the local script with CI validation.

### Verified

- Confirmed attribution, secret scanner, CLI commands, MCP server startup, and the local dashboard endpoints (`/healthz`, `/api/status`, `/dashboard`).

## 0.1.0 — 2026-06-28

- Initial public V1 of Codinfy Agent Monitor.
- Added CLI, animated Ink TUI, local Fastify/WebSocket dashboard, SQLite storage, and MCP stdio server.
- Added agents, tasks, workflow, timeline, usage provenance, Git, tests/build tracking, secret scanning, pre-commit review, environment detection, i18n, beginner mode, reports, AI Credit Saver, and Smart Model Router.
- Added `/codinfy` templates for Claude Code, Codex, Cursor, and Windsurf.

© CODINFY PLATFORMS SASU · codinfy.com
