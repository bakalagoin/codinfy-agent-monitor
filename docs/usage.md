# Usage

Start with `codinfy-agent-monitor init`, then `status` or `watch`. Adapters and MCP tools update agents, tasks, metrics, and timeline events in `.codinfy-agent-monitor/metrics.sqlite`.

## Metrics

```bash
codinfy-agent-monitor metric context 68 --source official
codinfy-agent-monitor metric rate 42 --source estimated
codinfy-agent-monitor metric daily 68 --source estimated
codinfy-agent-monitor metric weekly 42 --source estimated
```

Values are clamped to 0–100 and always carry their source. Estimated values are never represented as provider facts.

## Workflow and safety

Use MCP tools to register agents and tasks. Before a commit, run tests, build, secrets, and review. `review` is public-ready only when tests and build have passed, no secrets are found, and mandatory attribution is present.

```bash
codinfy-agent-monitor tests --run
codinfy-agent-monitor build --run
codinfy-agent-monitor secrets
codinfy-agent-monitor review
```

## Language and level

```bash
codinfy-agent-monitor language auto
codinfy-agent-monitor language fr
codinfy-agent-monitor level beginner
codinfy-agent-monitor level expert
```

Technical names, commands, paths, model names, MCP, JSON, and Git are not translated.

Codinfy Agent Monitor · `/codinfy` · `codinfy-agent-monitor`
© CODINFY PLATFORMS SASU · codinfy.com
