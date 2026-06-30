# Codinfy Agent Monitor design specifications

This folder is the implementation contract for the web dashboard, terminal UI, and host HUDs. Every visible state must be backed by a real local API or MCP tool; unknown data is labelled unavailable or estimated.

Start with [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md), [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md), [PAGE_MAP.md](./PAGE_MAP.md), and [UI_COMPONENTS.md](./UI_COMPONENTS.md). The `concepts/` folder contains the approved v0.2.0 visual references for the Node Server Monitor, Update Center, and stop confirmation.

Safety is part of the design: protected processes are inspect-only, stop requires confirmation, Force Kill requires a failed graceful stop plus a second confirmation, updates never auto-install, and restores require checksum verification.

Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor`
Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO · codinfy.com
