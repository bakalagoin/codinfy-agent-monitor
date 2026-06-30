# Page map

| Route             | Primary source                                         | Principal action                 |
| ----------------- | ------------------------------------------------------ | -------------------------------- |
| `/node-servers`   | `GET /api/node-servers` · `monitor.node_servers`       | Inspect; confirmed stop          |
| `/port-conflicts` | `GET /api/node-ports` · `monitor.port_conflicts`       | Review owners                    |
| `/process-map`    | `GET /api/process-map` · `monitor.project_process_map` | Inspect grouping                 |
| `/resource-guard` | `GET /api/resource-guard` · `monitor.resource_guard`   | Review recommendations           |
| `/update-center`  | `GET /api/update` · `monitor.update_status`            | Check, backup, confirmed install |
| `/release-notes`  | release payload · `monitor.update_changelog`           | Read only                        |
| `/backup-restore` | `GET /api/backups` · backup MCP tools                  | Create; confirmed restore        |
| `/doctor`         | `GET /api/doctor` · `monitor.health_doctor`            | Diagnose                         |
| `/recovery`       | `GET /api/recovery` · `monitor.session_recovery`       | Read-only brief                  |
| `/notifications`  | local config · `monitor.notifications`                 | Local preferences                |

Legacy v0.1.4 routes stay available and use the same navigation shell.

© CODINFY PLATFORMS SASU · codinfy.com
