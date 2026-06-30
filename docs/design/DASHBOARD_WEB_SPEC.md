# Web dashboard specification

The dashboard binds only to loopback, rejects non-loopback Host headers, applies a restrictive CSP, redacts API output, and requires same-origin browser requests for mutations.

The shell is a compact dark developer cockpit with a sticky navigation rail, operational top bar, responsive 12-column content area, and persistent attribution. New v0.2.0 pages load expensive process scans only when their route needs them.

Approved concepts:

- `concepts/node-server-monitor.png`
- `concepts/stop-node-confirmation.png`
- `concepts/mcp-update-center.png`

© CODINFY PLATFORMS SASU · codinfy.com
