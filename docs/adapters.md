# Adapters

## Claude Code

Copy `templates/claude-code/.claude`. The `/codinfy` command asks MCP `codinfy-agent-monitor` for status and focused views. The optional generic hook records only event names; it intentionally excludes prompt and tool payloads.

## Codex

Copy `templates/codex/.codex`. The TOML entry starts `codinfy-agent-monitor mcp`; `AGENTS.md` maps `/codinfy` to MCP tools.

## Cursor

Copy `templates/cursor/.cursor`. It contains `mcp.json`, a rule, and a compact skill.

## Windsurf

Copy `templates/windsurf/.windsurf`. It contains the MCP config and `/codinfy` rule.

Support varies by host version. When slash commands or hooks are unavailable, the CLI and local web dashboard remain the universal fallback. Adapters should record `official` metrics only when the host directly exposes those values.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO
Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor` · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
