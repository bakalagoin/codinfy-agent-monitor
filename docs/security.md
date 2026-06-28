# Security and privacy

Codinfy Agent Monitor is local-first and safe by default.

- SQLite and reports stay in the Git-ignored `.codinfy-agent-monitor/` directory.
- The dashboard binds to `127.0.0.1`.
- The secret scanner uses `git ls-files` to respect ignored files and never returns matched secret values.
- `.env`, private keys, credentials, logs, and local storage are blocked by `.gitignore`.
- Safe Guard is enabled by default; the monitor does not delete project files, push, edit `.env`, run destructive migrations, or switch models.
- Git inspection is read-only. Test/build execution occurs only with explicit `--run`.
- Report and MCP output passes through redaction.

Run this before a public commit:

```bash
codinfy-agent-monitor tests --run
codinfy-agent-monitor build --run
codinfy-agent-monitor secrets
codinfy-agent-monitor attribution-check
codinfy-agent-monitor review
git diff --check
```

Security reports should use GitHub private vulnerability reporting when available. Do not paste credentials into an issue.

Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor`
Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
