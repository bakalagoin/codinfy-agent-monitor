# MCP server

The public local server is named `codinfy-agent-monitor` and uses stdio:

```bash
codinfy-agent-monitor mcp
```

Tool families:

- status and dashboard: `monitor.status`, `monitor.open_dashboard`;
- Node operations: `monitor.node_servers`, `monitor.node_ports`, `monitor.node_orphans`, `monitor.node_inspect_process`, `monitor.node_stop_process`, `monitor.node_kill_process`, `monitor.node_refresh`, `monitor.node_cleanup_recommendations`;
- developer health: `monitor.port_conflicts`, `monitor.project_process_map`, `monitor.resource_guard`, `monitor.health_doctor`;
- updates: `monitor.update_check`, `monitor.update_status`, `monitor.update_changelog`, `monitor.update_install`, `monitor.update_rollback`, `monitor.update_settings`, `monitor.update_history`;
- continuity: `monitor.backup_create`, `monitor.backup_list`, `monitor.backup_restore`, `monitor.session_recovery`, `monitor.notifications`;
- agents: `monitor.list_agents`, `monitor.register_agent`, `monitor.update_agent_state`;
- limits: context, rate, daily, weekly;
- AI Credit Saver: advice, score, budget, cost, economy plan;
- tasks/workflow: create, update, list, workflow, timeline;
- operations: alerts, Codix Observer (`monitor.observer`, `monitor.recommendations`), Git, tests, build, environment, dependency health (`monitor.dependency_health`);
- developer: `monitor.git_diff` (with `full`), `monitor.check_command`, `monitor.commit_message`, `monitor.pr_summary`, `monitor.docs_check`, `monitor.handoff`;
- guided: `monitor.simple_report`, `monitor.explain_error`, `monitor.model_rules`, `monitor.switch_model`;
- safety: review before commit, secret scan, attribution;
- reporting: `monitor.export_report` (formats: md, json, html).

Every result is passed through redaction. The MCP does not read provider keys and does not expose `.env`. `monitor.get_attribution` returns the immutable product identity. Model advice is categorical and always says that a switch requires confirmation.

Compatible templates are supplied for Claude Code, Codex, Cursor, and Windsurf. Other MCP hosts can use the generic command/args configuration in the README.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO
MCP: `codinfy-agent-monitor` · Command: `/codinfy` · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
