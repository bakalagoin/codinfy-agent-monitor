# Adapters

## Claude Code

Copy `templates/claude-code/.claude`. The `/codinfy` command asks MCP `codinfy-agent-monitor` for status and focused views. `.claude/settings.json` activates lifecycle hooks. They record only the bounded event name and host identifier; prompt, tool input and stdin payloads are intentionally ignored.

## Codex

Copy `templates/codex/.codex`. The TOML entry starts `codinfy-agent-monitor mcp` and enables the hooks feature; `hooks.json` records safe lifecycle names, while `AGENTS.md` maps `/codinfy` to MCP tools.

## Cursor

Copy `templates/cursor/.cursor`. It contains `mcp.json`, a rule, and a compact skill. Cursor monitoring is MCP-driven; v0.2.0 does not claim a native automatic hook that is not covered by the verified host integration.

## Windsurf

Copy `templates/windsurf/.windsurf`. It contains the MCP config, `/codinfy` rule and workspace lifecycle hooks for code reads/writes, commands, MCP calls, prompts and Cascade responses.

All native hook wrappers locate the globally installed `codinfy-agent-monitor` outside the monitored project, call `adapter-event <host> <event>`, and always exit without blocking the host workflow.

Support varies by host version. When slash commands or hooks are unavailable, the CLI and local web dashboard remain the universal fallback. Adapters should record `official` metrics only when the host directly exposes those values.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO
Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor` · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
