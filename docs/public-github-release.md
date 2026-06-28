# Public GitHub release checklist

1. Run `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm format:check`.
2. Run the installed CLI test/build monitors so the pre-commit session records both results.
3. Run `codinfy-agent-monitor secrets`, `attribution-check`, and `review`.
4. Inspect `git status --short`, `git diff --check`, and the staged diff.
5. Confirm `.env`, credentials, `.codinfy-agent-monitor/`, logs, and private reports are absent.
6. Confirm README, LICENSE, NOTICE.md, ATTRIBUTION.md, terminal, dashboard, About, templates, and reports retain Codinfy identity.
7. Commit with `feat: initial public release of Codinfy Agent Monitor` and push `main` to public repository `codinfy-agent-monitor`.

Legal note: the custom attribution license may be treated as source-available rather than OSI open source and should receive counsel review for high-stakes use.

Created by CODINFY PLATFORMS SASU · Bakala Goin — Founder & CEO
Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor` · codinfy.com
© CODINFY PLATFORMS SASU · codinfy.com
