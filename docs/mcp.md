# MCP server

The public local server is named `codinfy-agent-monitor` and uses stdio:

```bash
codinfy-agent-monitor mcp
```

Tool families:

- status and dashboard: `monitor.status`, `monitor.open_dashboard`;
- agents: `monitor.list_agents`, `monitor.register_agent`, `monitor.update_agent_state`;
- limits: context, rate, daily, weekly;
- AI Credit Saver: advice, score, budget, cost, economy plan;
- tasks/workflow: create, update, list, workflow, timeline;
- operations: alerts, Codix Observer recommendations, Git, tests, build, environment;
- safety: review before commit, secret scan, attribution;
- reporting: `monitor.export_report`.

Every result is passed through redaction. The MCP does not read provider keys and does not expose `.env`. `monitor.get_attribution` returns the immutable product identity. Model advice is categorical and always says that a switch requires confirmation.

Compatible templates are supplied for Claude Code, Codex, Cursor, and Windsurf. Other MCP hosts can use the generic command/args configuration in the README.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO
MCP: `codinfy-agent-monitor` · Command: `/codinfy` · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
