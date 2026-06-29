# Changelog

## 0.1.3 — 2026-06-29

### Added

- Codix Observer: blocker detection (stalled/blocked/error agents, repeated file reads, repeated command failures, 429/rate-limit bursts) and contextual recommendations (high context, usage pressure, model mismatch, missing security review). Exposed via the `observer` CLI command and `monitor.observer` MCP tool, and now powering `monitor.recommendations`.
- Dependency health helper with the `deps` CLI command (`--run` to execute outdated/audit) and the `monitor.dependency_health` MCP tool, using trusted executable resolution and redacted output.
- Enriched developer commands: `diff --full` (redacted patch content), `history` (recent commands/checks with success markers), and report export in `md`, `json`, or `html` via `export --format` and the `monitor.export_report` format parameter.
- JSON and HTML session report renderers with full Codinfy attribution; extended fr/en i18n keys (observer, recommendations, dependencies, history, report).
- Immersive glass mission-control dashboard with responsive navigation, animated usage meters, workflow rail, agent radar, live timeline, release health, Git, environment, AI Credit Saver and official Codinfy social identity.
- Official web routes `/codinfy` and `/codinfy-agent-monitor`, alongside the compatible `/dashboard` alias.
- Security regressions for project-root propagation, Git remote credential redaction, scanner fallback, symlink storage rejection, hook isolation and terminal-control sanitization.

### Security

- Restricted HTTP Host and WebSocket Origin to loopback, capped live sockets, and added browser hardening headers.
- Replaced project-local executable lookup with trusted absolute resolution for Git, environment probes and package-manager commands.
- Redacted secrets before durable storage and report generation; bounded persistent event history.
- Made secret scanning fail closed for inventory gaps, symlinks, unreadable, binary and oversized files without exposing source-line previews.
- Pinned GitHub Actions by commit SHA and added a tracked-worktree integrity gate before public-release checks.

### Fixed

- Applied the global `--project` option consistently to CLI status, test/build, review, reset and guided commands.
- Fixed the generated dashboard route parser that prevented live data from rendering.
- Loaded expensive release/environment checks progressively so the live command center becomes useful first.

### Changed

- Bumped all workspace package versions to `0.1.3`.

## 0.1.2 — 2026-06-28

### Added

- New developer commands: `diff`, `commit-message`, `pr`, `docs-check`, `handoff`, and `check-command` (dangerous-command detection).
- New beginner commands: `explain-error`, `simple-report` (traffic-light health), `github-guide`, and `learn`.
- New Smart Model Router commands: `switch-model` (records intent, never auto-switches) and `model-rules` (configurable catalog + score thresholds).
- Core helpers `getGitDiffStat` and `detectDangerousCommand` with a regression test.
- 10 new MCP tools (now 40 total) mirroring the developer/guided commands (`monitor.git_diff`, `monitor.check_command`, `monitor.commit_message`, `monitor.pr_summary`, `monitor.docs_check`, `monitor.handoff`, `monitor.simple_report`, `monitor.explain_error`, `monitor.model_rules`, `monitor.switch_model`).
- Enriched local dashboard with Git status, pre-commit health, and environment sections, active-nav highlighting, and `/api/git`, `/api/agents`, `/api/timeline`, `/api/review` endpoints.
- Per-page dashboard views: each sidebar route (`/agents`, `/git`, `/timeline`, `/about`, …) now focuses on its relevant sections with a page title and active-nav state; added a Tasks & workflow section and an About card.

### Changed

- Bumped all workspace package versions to `0.1.2`.

## 0.1.1 — 2026-06-28

### Fixed

- Fixed root `pnpm check` order so `build` runs before the CLI tests, preventing failures on a clean clone where `dist/` does not yet exist.
- Extended `check` to also run the secret scanner and the attribution check, aligning the local script with CI validation.

### Verified

- Confirmed attribution, secret scanner, CLI commands, MCP server startup, and the local dashboard endpoints (`/healthz`, `/api/status`, `/dashboard`).

## 0.1.0 — 2026-06-28

- Initial public V1 of Codinfy Agent Monitor.
- Added CLI, animated Ink TUI, local Fastify/WebSocket dashboard, SQLite storage, and MCP stdio server.
- Added agents, tasks, workflow, timeline, usage provenance, Git, tests/build tracking, secret scanning, pre-commit review, environment detection, i18n, beginner mode, reports, AI Credit Saver, and Smart Model Router.
- Added `/codinfy` templates for Claude Code, Codex, Cursor, and Windsurf.

© CODINFY PLATFORMS SASU · codinfy.com
