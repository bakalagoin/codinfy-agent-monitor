# UI component contract

- `AppShell`: official brand lockup, grouped navigation, `/codinfy` workspace card, live state, mandatory footer.
- `MetricCard`: label, value, provenance, last update; never value-only.
- `ServerTable`: status, PID, ports, framework, project, resources, risk, protected action state.
- `PortOwnerRow`: address, port, PID, process name, exposure, protection.
- `ProcessInspector`: complete redacted identity and recommended action.
- `ConfirmProcessModal`: identity grid, impact, checkbox, graceful stop, locked Force Kill.
- `UpdateBanner`: current/latest version, channel, auto-install OFF, update availability.
- `PreflightChecklist`: passed/warning/failed with direct remediation.
- `BackupRow`: timestamp, project, version, checksum validity.
- `DoctorCheck`: label, status, evidence, remediation.
- `EmptyState`, `ErrorState`, `LoadingState`, `ProtectedBadge`, `EstimateBadge`.

All actionable controls remain keyboard reachable and expose a visible focus state.

© CODINFY PLATFORMS SASU · codinfy.com
