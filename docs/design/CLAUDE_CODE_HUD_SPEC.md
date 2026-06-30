# Claude Code HUD specification

Claude Code connects through `codinfy-agent-monitor` MCP. `/codinfy` calls `monitor.status` first, identifies estimated usage, then routes to the requested tool. The HUD never claims provider limits that were not reported by an official adapter.

Process, update, rollback, and restore actions surface confirmation requirements instead of applying them automatically.

© CODINFY PLATFORMS SASU · codinfy.com
