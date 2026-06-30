# Backup & Restore

Route `/backup-restore` lists local `.codinfy-backup.json` files with timestamp, monitor version, project, and checksum state. Backups contain redacted monitor configuration only, use restrictive permissions, and stay inside `.codinfy-agent-monitor/backups`.

Restore rejects paths outside that directory, symlinks, invalid schemas, and checksum mismatch. Confirmation is mandatory and a safety backup of the current configuration is created before replacement.

© CODINFY PLATFORMS SASU · codinfy.com
