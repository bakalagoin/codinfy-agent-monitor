# Changelog

## 0.2.0 — 2026-06-30

### Added

- Cross-platform Node/Bun/Deno server inventory with live TCP ownership, framework/project inference, CPU, memory, uptime, orphan candidates, conflicts, public exposure, and conservative protection.
- Confirmed process control with live identity revalidation, protected-process refusal, graceful-first policy, and Force Kill gated behind a failed stop plus a second confirmation.
- MCP Update Center backed by GitHub releases and SemVer, including changelog, breaking changes, install-method detection, preflight, history, safe settings, confirmed npm-global install, and rollback.
- Checksum-protected configuration backup/restore, MCP Health Doctor, Project Process Map, Resource Guard, Session Recovery, Auto Cleanup Suggestions, and local notification preferences.
- Ten live dashboard routes and local JSON APIs for the complete v0.2.0 developer-operations surface.
- 24 new MCP tools and nested CLI families for `node`, `update`, and `backup`.
- Complete design system and page specifications under `docs/design/`, with approved Node Monitor, stop confirmation, and Update Center concepts.

### Security

- Update auto-install is structurally disabled.
- Process command lines are redacted before API, MCP, CLI, timeline, or UI output.
- Stop, kill, install, rollback, and restore require explicit confirmation; mutation APIs also enforce same-origin browser requests.
- Unknown Node identities and the Codinfy runtime/dashboard/MCP host family are protected by default.

### Compatibility

- Preserves `/codinfy`, `codinfy-agent-monitor`, all v0.1.4 routes, host adapters, local storage, and mandatory Codinfy attribution.
- Node.js 22.13+ remains required.

## 0.1.4 — 2026-06-30

### Added

- Dedicated live dashboard panels for all 20 routes, including tasks, modified files, tests/build, security, Codix Observer, dependency health, reports, history and local settings.
- Dashboard APIs for tasks, files, checks, observer, dependencies, reports, settings and command/check history.
- Explicit browser actions for tests, builds and redacted Markdown/JSON/HTML report exports.
- Native, payload-free lifecycle hook templates for Claude Code, Codex and Windsurf. Hook events register the host as a live adapter agent and add a redacted timeline event.
- Automatic or explicit French/English dashboard navigation, descriptions and usage labels.

### Security

- Require a validated same-origin browser request for every dashboard mutation.
- Keep hook stdin and host payloads out of storage; only allow bounded host and event identifiers.
- Resolve the global monitor CLI outside the monitored project and preserve safe Windows batch execution.

### Fixed

- Replaced reused placeholder panels with route-specific data views.
- Added exponential WebSocket reconnection and invalid-update isolation.
- Activated shipped hook templates through `.claude/settings.json`, `.codex/hooks.json` and `.windsurf/hooks.json`.
- Completed the Codinfy social identity in the dashboard with Bakala Goin Facebook, Instagram and LinkedIn links.

### Changed

- Bumped all workspace package versions to `0.1.4`.

## 0.1.3 — 2026-06-29

### Added

- Codix Observer: blocker detection (stalled/blocked/error agents, repeated file reads, repeated command failures, 429/rate-limit bursts) and contextual recommendations (high context, usage pressure, model mismatch, missing security review). Exposed via the `observer` CLI command and `monitor.observer` MCP tool, and now powering `monitor.recommendations`.
- Dependency health helper with the `deps` CLI command (`--run` to execute outdated/audit) and the `monitor.dependency_health` MCP tool, using trusted executable resolution and redacted output.
- Enriched developer commands: `diff --full` (redacted patch content), `history` (recent commands/checks with success markers), and report export in `md`, `json`, or `html` via `export --format` and the `monitor.export_report` format parameter.
- JSON and HTML session report renderers with full Codinfy attribution; extended fr/en i18n keys (observer, recommendations, dependencies, history, report).
- Immersive glass mission-control dashboard with responsive navigation, animated usage meters, workflow rail, agent radar, live timeline, release health, Git, environment, AI Credit Saver and official Codinfy social identity.
- Official web routes `/codinfy` and `/codinfy-agent-monitor`, alongside the compatible `/dashboard` alias.
- Security regressions for project-root propagation, Git remote credential redaction, scanner fallback, symlink storage rejection, hook isolation and terminal-control sanitization.
- Full-resolution README demos for the immersive mission-control showcase and the live local `/codinfy` dashboard.

### Security

- Restricted HTTP Host and WebSocket Origin to loopback, capped live sockets, and added browser hardening headers.
- Replaced project-local executable lookup with trusted absolute resolution for Git, environment probes and package-manager commands.
- Redacted secrets before durable storage and report generation; bounded persistent event history.
- Made secret scanning fail closed for inventory gaps, symlinks, unreadable, unknown binary and oversized files without exposing source-line previews; known visual assets are scanned for recognizable embedded secret signatures.
- Pinned GitHub Actions by commit SHA and added a tracked-worktree integrity gate before public-release checks.

### Fixed

- Applied the global `--project` option consistently to CLI status, test/build, review, reset and guided commands.
- Fixed the generated dashboard route parser that prevented live data from rendering.
- Loaded expensive release/environment checks progressively so the live command center becomes useful first.
- Allowed validated absolute Windows wrapper paths to pass the trusted package-manager launcher, fixing `tests --run` and `build --run` when `pnpm.cmd` is provided by a bundled runtime.

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
