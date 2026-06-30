# Node Server Monitor

Route `/node-servers` uses `AgentMonitor.nodeServers()`, `GET /api/node-servers`, and `monitor.node_servers`/`monitor.node_refresh`.

The page shows active server count, unique Node ports, orphan candidates, conflicts, protected count, then a live table containing status, PID, port, framework, project, command identity, age, CPU, memory, risk, and action. Unknown projects are explicitly protected.

Stop flow: select an unprotected row → re-read live identity → show impact modal → require checkbox → request non-forceful stop. Force Kill remains locked until that stop fails, then requires a re-inspection, reset checkbox, and second confirmation. See `concepts/node-server-monitor.png` and `concepts/stop-node-confirmation.png`.

© CODINFY PLATFORMS SASU · codinfy.com
