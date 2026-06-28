#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  CODINFY_SOCIALS,
  DEFAULT_MODEL_CATALOG,
  checkAttribution,
  detectDangerousCommand,
  formatAttribution,
  getGitDiffStat,
  getModelAdvice,
  redactSecrets,
  scanSecrets,
} from '@codinfy/agent-monitor-core';
import { renderSnapshot, runTui } from '@codinfy/agent-monitor-tui';

const program = new Command();

function print(value: unknown): void {
  console.log(redactSecrets(typeof value === 'string' ? value : JSON.stringify(value, null, 2)));
}

function withMonitor<T>(action: (monitor: AgentMonitor) => T, root = process.cwd()): T {
  const monitor = new AgentMonitor(root);
  try {
    return action(monitor);
  } finally {
    monitor.close();
  }
}

function addSimpleSnapshotCommand(
  name: string,
  description: string,
  pick: (monitor: AgentMonitor) => unknown,
): void {
  program
    .command(name)
    .description(description)
    .action(() => withMonitor((monitor) => print(pick(monitor))));
}

program
  .name('codinfy-agent-monitor')
  .description(
    'Codinfy Agent Monitor — real-time AI agent, workflow, usage, Git and security monitoring.',
  )
  .version('0.1.2')
  .option('-C, --project <path>', 'project root to monitor', process.cwd())
  .showHelpAfterError();

program
  .command('init')
  .description('Initialize safe local monitoring storage.')
  .action(() => {
    const root = program.opts<{ project: string }>().project;
    withMonitor((monitor) => {
      monitor.store.recordEvent('monitor.initialized', 'Codinfy Agent Monitor initialized');
      print(
        `${chalk.green('✓')} Codinfy Agent Monitor initialized\nData: ${monitor.store.dataRoot}\n${CODINFY_ATTRIBUTION.signature}`,
      );
    }, root);
  });

program
  .command('status')
  .description('Show the current monitoring dashboard snapshot.')
  .action(() => {
    const root = program.opts<{ project: string }>().project;
    withMonitor((monitor) => print(renderSnapshot(monitor.snapshot(), monitor.language)), root);
  });

for (const name of ['hud', 'watch']) {
  program
    .command(name)
    .description('Open the animated terminal dashboard (q to quit).')
    .action(async () => {
      const monitor = new AgentMonitor(program.opts<{ project: string }>().project);
      try {
        await runTui(monitor);
      } finally {
        monitor.close();
      }
    });
}

addSimpleSnapshotCommand('agents', 'List active, idle, blocked, and completed agents.', (monitor) =>
  monitor.store.listAgents(),
);
addSimpleSnapshotCommand(
  'context',
  'Show context usage and data source.',
  (monitor) => monitor.store.getMetrics().context,
);
addSimpleSnapshotCommand('limits', 'Show rate, daily, weekly, and context limits.', (monitor) =>
  monitor.store.getMetrics(),
);
addSimpleSnapshotCommand('usage', 'Alias for limits.', (monitor) => monitor.store.getMetrics());
addSimpleSnapshotCommand(
  'daily',
  'Show daily usage.',
  (monitor) => monitor.store.getMetrics().daily,
);
addSimpleSnapshotCommand(
  'weekly',
  'Show weekly usage.',
  (monitor) => monitor.store.getMetrics().weekly,
);
addSimpleSnapshotCommand('workflow', 'Show workflow progress and tasks.', (monitor) => ({
  progress: monitor.snapshot().workflowProgress,
  tasks: monitor.store.listTasks(),
}));
addSimpleSnapshotCommand('tasks', 'List workflow tasks.', (monitor) => monitor.store.listTasks());
addSimpleSnapshotCommand('timeline', 'Show recent activity.', (monitor) =>
  monitor.store.timeline(50),
);
addSimpleSnapshotCommand(
  'files',
  'Show Git-visible modified files.',
  (monitor) => monitor.snapshot().git.files,
);
addSimpleSnapshotCommand('git', 'Show read-only Git status.', (monitor) => monitor.snapshot().git);
addSimpleSnapshotCommand(
  'environment',
  'Detect Host, VPS, Shared, Docker, Localhost and tools.',
  (monitor) => monitor.environment(),
);
addSimpleSnapshotCommand('hosting', 'Alias for environment.', (monitor) => monitor.environment());
addSimpleSnapshotCommand('health', 'Show project health summary.', (monitor) => {
  const snapshot = monitor.snapshot();
  const review = monitor.review();
  return {
    overall: review.ready
      ? 'green'
      : snapshot.errors || review.secretFindings.length
        ? 'red'
        : 'yellow',
    agents: { errors: snapshot.errors, blockers: snapshot.blockers },
    tests: review.tests,
    build: review.build,
    secrets: review.secretFindings.length,
    git: snapshot.git.available ? 'ok' : 'unavailable',
  };
});
addSimpleSnapshotCommand('why-blocked', 'Explain current blockers.', (monitor) => {
  const snapshot = monitor.snapshot();
  return {
    blockers: snapshot.agents.filter((agent) => agent.status === 'blocked'),
    tasks: snapshot.tasks.filter((task) => task.status === 'blocked'),
    suggestions: snapshot.advice.reasons,
  };
});

program
  .command('metric <name> <value>')
  .description('Record a usage metric from an adapter.')
  .option('--source <source>', 'official or estimated', 'estimated')
  .action((name: string, value: string, options: { source: string }) => {
    if (!['context', 'rate', 'daily', 'weekly'].includes(name))
      throw new Error('Metric must be context, rate, daily, or weekly.');
    if (!['official', 'estimated'].includes(options.source))
      throw new Error('Source must be official or estimated.');
    withMonitor((monitor) =>
      print(
        monitor.setMetric(
          name as 'context' | 'rate' | 'daily' | 'weekly',
          Number(value),
          options.source as 'official' | 'estimated',
        ),
      ),
    );
  });
program
  .command('event <type> [message...]')
  .description('Record a redacted adapter event.')
  .action((type: string, message: string[]) => {
    withMonitor((monitor) =>
      print(monitor.store.recordEvent(type, redactSecrets(message.join(' ') || type))),
    );
  });

program
  .command('tests')
  .description('Show or run project tests.')
  .option('--run', 'run the project test script')
  .action((options: { run?: boolean }) => {
    withMonitor((monitor) => {
      const result = options.run
        ? monitor.runProjectScript('tests')
        : { status: monitor.review().tests, event: monitor.store.latestEvent('check.tests') };
      print(result);
      if (options.run && 'success' in result && !result.success) process.exitCode = 1;
    });
  });
program
  .command('build')
  .description('Show or run the project build.')
  .option('--run', 'run the project build script')
  .action((options: { run?: boolean }) => {
    withMonitor((monitor) => {
      const result = options.run
        ? monitor.runProjectScript('build')
        : { status: monitor.review().build, event: monitor.store.latestEvent('check.build') };
      print(result);
      if (options.run && 'success' in result && !result.success) process.exitCode = 1;
    });
  });

program
  .command('secrets')
  .alias('scan-secrets')
  .description('Scan tracked and unignored files without revealing secret values.')
  .action(() => {
    const findings = scanSecrets(program.opts<{ project: string }>().project);
    print({ clean: findings.length === 0, findings });
    if (findings.length) process.exitCode = 1;
  });
program
  .command('review')
  .description('Run the pre-commit public-ready review.')
  .action(() =>
    withMonitor((monitor) => {
      const review = monitor.review();
      print(review);
      if (!review.ready) process.exitCode = 1;
    }),
  );
program
  .command('public-ready')
  .description('Alias for the pre-commit review.')
  .action(() =>
    withMonitor((monitor) => {
      const review = monitor.review();
      print(review);
      if (!review.ready) process.exitCode = 1;
    }),
  );
program
  .command('attribution-check')
  .description('Verify mandatory Codinfy identity and social credits.')
  .action(() => {
    const missing = checkAttribution(program.opts<{ project: string }>().project);
    print({ valid: Object.keys(missing).length === 0, missing });
    if (Object.keys(missing).length) process.exitCode = 1;
  });

function printAdvice(task: string): void {
  withMonitor((monitor) => {
    const snapshot = monitor.snapshot();
    print(
      getModelAdvice({
        task,
        currentCategory: monitor.store.getConfig().currentCategory,
        contextUsage: snapshot.metrics.context.value,
        dailyUsage: snapshot.metrics.daily.value,
        weeklyUsage: snapshot.metrics.weekly.value,
        activeAgents: snapshot.agents.length,
        fileCount: snapshot.git.files.length,
        recentErrors: snapshot.errors,
        level: monitor.store.getConfig().level,
      }),
    );
  });
}
program
  .command('saver [mode]')
  .description('Show AI Credit Saver advice; modes: on, off, auto, expert.')
  .action((mode?: string) => {
    if (mode)
      withMonitor((monitor) => monitor.store.recordEvent('saver.mode', `Saver mode: ${mode}`));
    printAdvice('optimize the current monitored task');
  });
program
  .command('model-advice [task...]')
  .description('Recommend the right configurable model category.')
  .action((task: string[]) => printAdvice(task.join(' ') || 'monitor project status'));
program
  .command('model-score [task...]')
  .description('Calculate a Model Need Score.')
  .action((task: string[]) => printAdvice(task.join(' ') || 'monitor project status'));
addSimpleSnapshotCommand('budget', 'Show daily and weekly budget pressure.', (monitor) => ({
  daily: monitor.store.getMetrics().daily,
  weekly: monitor.store.getMetrics().weekly,
  advice: monitor.snapshot().advice,
}));
addSimpleSnapshotCommand('cost', 'Show relative cost-saving estimate.', (monitor) => ({
  advice: monitor.snapshot().advice,
  note: 'Relative estimate; no provider billing API is queried.',
}));
addSimpleSnapshotCommand('economy-plan', 'Show token and credit saving plan.', (monitor) => ({
  recommendations: monitor.snapshot().advice.reasons,
  actions: [
    'Compact context above 80%',
    'Batch small tasks',
    'Reduce idle agents',
    'Use the recommended category after confirmation',
  ],
}));

program
  .command('language [language]')
  .description('Get or set language: auto, fr, en.')
  .action((language?: string) =>
    withMonitor((monitor) => {
      if (language) {
        if (!['auto', 'fr', 'en'].includes(language))
          throw new Error('Language must be auto, fr, or en.');
        monitor.store.updateConfig({ language: language as 'auto' | 'fr' | 'en' });
      }
      print({ configured: monitor.store.getConfig().language, detected: monitor.language });
    }),
  );
program
  .command('level [level]')
  .description('Get or set user level: beginner, intermediate, expert.')
  .action((level?: string) =>
    withMonitor((monitor) => {
      if (level) {
        if (!['beginner', 'intermediate', 'expert'].includes(level))
          throw new Error('Level must be beginner, intermediate, or expert.');
        monitor.store.updateConfig({ level: level as 'beginner' | 'intermediate' | 'expert' });
      }
      print(monitor.store.getConfig().level);
    }),
  );
program
  .command('safe [state]')
  .description('Get or set Safe Guard: on or off.')
  .action((state?: string) =>
    withMonitor((monitor) => {
      if (state) {
        if (!['on', 'off'].includes(state)) throw new Error('Safe Guard state must be on or off.');
        monitor.store.updateConfig({ safeGuard: state === 'on' });
      }
      print({
        safeGuard: monitor.store.getConfig().safeGuard,
        policy:
          'No destructive action, push, .env edit, or automatic model switch without confirmation.',
      });
    }),
  );
program
  .command('beginner')
  .description('Enable beginner explanations.')
  .action(() =>
    withMonitor((monitor) => {
      monitor.store.updateConfig({ level: 'beginner' });
      print('Beginner mode enabled. Use status, next, checklist, glossary, and install-guide.');
    }),
  );
program
  .command('next')
  .description('Suggest the next safe action.')
  .action(() =>
    withMonitor((monitor) => {
      const review = monitor.review();
      print(
        review.secretFindings.length
          ? 'Review and remove secret findings first.'
          : review.tests === 'not_run'
            ? 'Run project tests.'
            : review.build === 'not_run'
              ? 'Run the project build.'
              : review.ready
                ? 'The project is ready for a reviewed commit.'
                : (review.notes[0] ?? 'Review the current warnings.'),
      );
    }),
  );
program
  .command('checklist')
  .description('Show a beginner-friendly continuation checklist.')
  .action(() =>
    print([
      'Read the current status',
      'Review blockers and errors',
      'Run tests',
      'Run build',
      'Scan secrets',
      'Review Git diff',
      'Commit only after human confirmation',
    ]),
  );
program
  .command('glossary')
  .description('Show a compact monitoring glossary.')
  .action(() =>
    print({
      context: 'Conversation capacity used by the AI tool.',
      rate: 'Current request/token throughput pressure.',
      MCP: 'Model Context Protocol for connecting AI tools to local capabilities.',
      estimated: 'Calculated locally because no official provider metric was available.',
    }),
  );
program
  .command('install-guide')
  .description('Show installation steps.')
  .action(() =>
    print(
      'Install Node.js 22.13+, run pnpm install && pnpm build, then codinfy-agent-monitor init. See docs/installation.md.',
    ),
  );
program
  .command('commands')
  .description('List commands.')
  .action(() => program.outputHelp());

program
  .command('export')
  .alias('report')
  .description('Export a redacted Markdown report.')
  .action(() =>
    withMonitor((monitor) =>
      print({ path: monitor.exportReport(true), signature: CODINFY_ATTRIBUTION.signature }),
    ),
  );
program
  .command('reset')
  .description('Reset local monitor data; project files are untouched.')
  .option('--yes', 'confirm reset')
  .action((options: { yes?: boolean }) => {
    if (!options.yes) throw new Error('Reset requires --yes. Project files are never deleted.');
    withMonitor((monitor) => {
      monitor.reset();
      print('Local monitoring data reset.');
    });
  });
program
  .command('doctor')
  .description('Check runtime, storage, Git, and attribution.')
  .action(() =>
    withMonitor((monitor) =>
      print({
        node: process.version,
        dataRoot: monitor.store.dataRoot,
        database: monitor.store.databasePath,
        environment: monitor.environment(),
        attributionMissing: checkAttribution(monitor.store.projectRoot),
      }),
    ),
  );
program
  .command('about')
  .description('Show official creator, identity, and social credits.')
  .action(() => {
    console.log(chalk.cyan(formatAttribution()));
    console.table(CODINFY_SOCIALS);
  });

program
  .command('diff')
  .description('Show a read-only Git diff summary (stat only).')
  .action(() => print(getGitDiffStat(program.opts<{ project: string }>().project)));
program
  .command('commit-message')
  .description('Suggest a Conventional Commit message from the current Git changes.')
  .action(() =>
    withMonitor((monitor) => {
      const snapshot = monitor.snapshot();
      const review = monitor.review();
      const scope = snapshot.git.files.length === 1 ? snapshot.git.files[0] : undefined;
      const type = review.secretFindings.length || snapshot.errors ? 'fix' : 'chore';
      print({
        suggestion: `${type}${scope ? `(${scope})` : ''}: describe the change in imperative mood`,
        changedFiles: snapshot.git.files.length,
        ready: review.ready,
        note: 'Suggestion only; review the diff and confirm before committing.',
      });
    }),
  );
program
  .command('pr')
  .description('Generate a pull-request summary from Git and the activity timeline.')
  .action(() =>
    withMonitor((monitor) => {
      const snapshot = monitor.snapshot();
      const review = monitor.review();
      print({
        branch: snapshot.git.branch,
        changedFiles: snapshot.git.files.length,
        publicReady: review.ready,
        tests: review.tests,
        build: review.build,
        secretFindings: review.secretFindings.length,
        recentActivity: snapshot.timeline.slice(0, 5).map((event) => event.message),
        signature: CODINFY_ATTRIBUTION.signature,
      });
    }),
  );
program
  .command('docs-check')
  .description('Check that key documentation files are present.')
  .action(() => {
    const root = program.opts<{ project: string }>().project;
    const required = [
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'NOTICE.md',
      'ATTRIBUTION.md',
      'docs/installation.md',
      'docs/usage.md',
      'docs/mcp.md',
      'docs/security.md',
    ];
    const missing = required.filter((file) => !existsSync(join(root, file)));
    print({ complete: missing.length === 0, missing });
    if (missing.length) process.exitCode = 1;
  });
program
  .command('handoff')
  .description('Print a concise session handoff summary for the next person or AI.')
  .action(() =>
    withMonitor((monitor) => {
      const snapshot = monitor.snapshot();
      const review = monitor.review();
      print({
        project: snapshot.project,
        session: snapshot.session,
        tool: snapshot.tool,
        workflowProgress: `${snapshot.workflowProgress}%`,
        activeAgents: snapshot.agents.filter((agent) => agent.status !== 'idle').length,
        errors: snapshot.errors,
        blockers: snapshot.blockers,
        publicReady: review.ready,
        latestAction: snapshot.latestAction,
        recommendations: snapshot.advice.reasons,
        signature: CODINFY_ATTRIBUTION.signature,
      });
    }),
  );
program
  .command('memory [action]')
  .description('Save a redacted session memory digest (action: save).')
  .action((action?: string) =>
    withMonitor((monitor) => {
      if (action && action !== 'save') throw new Error('Only "save" is supported.');
      const path = monitor.exportReport(true);
      monitor.store.recordEvent('memory.saved', 'Session memory digest saved');
      print({ saved: path, signature: CODINFY_ATTRIBUTION.signature });
    }),
  );
program
  .command('explain-error')
  .description('Explain the most recent error in simple terms.')
  .action(() =>
    withMonitor((monitor) => {
      const snapshot = monitor.snapshot();
      const errorEvent = snapshot.timeline.find((event) => /error|fail|blocked/i.test(event.type));
      print({
        hasError: snapshot.errors > 0 || Boolean(errorEvent),
        latestError: errorEvent?.message ?? 'No error recorded in this session.',
        plainExplanation:
          snapshot.errors > 0
            ? 'An agent reported an error. Open the timeline, read the last action, fix the cause, then re-run tests.'
            : 'Nothing is failing right now. Keep going and run tests before committing.',
        nextStep: snapshot.blockers ? 'Resolve blockers first.' : 'Run tests, then review.',
      });
    }),
  );
program
  .command('simple-report')
  .description('Show a non-technical traffic-light health summary.')
  .action(() =>
    withMonitor((monitor) => {
      const snapshot = monitor.snapshot();
      const review = monitor.review();
      const light = (ok: boolean, warn = false) => (ok ? '🟢' : warn ? '🟡' : '🔴');
      print(
        [
          `Overall: ${review.ready ? '🟢 Good' : snapshot.errors ? '🔴 Problem' : '🟡 Attention'}`,
          `Security: ${light(review.secretFindings.length === 0 && review.sensitiveFiles.length === 0, review.sensitiveFiles.length > 0)}`,
          `Tests: ${light(review.tests === 'passed', review.tests === 'not_run')}`,
          `Build: ${light(review.build === 'passed', review.build === 'not_run')}`,
          `Git: ${light(snapshot.git.available, true)}`,
          `Errors: ${snapshot.errors} · Blockers: ${snapshot.blockers}`,
          CODINFY_ATTRIBUTION.signature,
        ].join('\n'),
      );
    }),
  );
program
  .command('github-guide')
  .description('Show beginner-friendly steps to publish on GitHub safely.')
  .action(() =>
    print(
      [
        '1. Run codinfy-agent-monitor review and fix any findings.',
        '2. Confirm git status and git diff show only intended changes.',
        '3. Ensure .env and secrets are git-ignored (never commit them).',
        '4. git add . && git commit -m "feat: ..." with a clear message.',
        '5. Create the public repo: gh repo create codinfy-agent-monitor --public --source=. --push',
        '6. Or set the remote, then git push -u origin main.',
        CODINFY_ATTRIBUTION.signature,
      ].join('\n'),
    ),
  );
program
  .command('learn')
  .description('Show short learning tips for working with AI agents.')
  .action(() =>
    print([
      'Watch context usage; summarize before it gets too high.',
      'Match the model category to the task with model-advice.',
      'Always run review before committing.',
      'Never paste secrets into prompts; the scanner redacts them anyway.',
      'Use the timeline to understand what each agent did.',
    ]),
  );
program
  .command('protect [state]')
  .description('Alias of safe: enable/disable Safe Guard confirmations.')
  .action((state?: string) =>
    withMonitor((monitor) => {
      if (state) {
        if (!['on', 'off'].includes(state)) throw new Error('Protect state must be on or off.');
        monitor.store.updateConfig({ safeGuard: state === 'on' });
      }
      print({
        safeGuard: monitor.store.getConfig().safeGuard,
        policy:
          'No destructive action, push, .env edit, or automatic model switch without confirmation.',
      });
    }),
  );
program
  .command('check-command <command...>')
  .description('Detect dangerous shell commands before running them.')
  .action((command: string[]) => {
    const result = detectDangerousCommand(command.join(' '));
    print({
      ...result,
      advice: result.dangerous
        ? 'Dangerous command detected. Enable Safe Guard and confirm manually before running.'
        : 'No dangerous pattern detected.',
    });
    if (result.dangerous) process.exitCode = 1;
  });
program
  .command('switch-model <category>')
  .description('Record an intent to switch model category (never switches automatically).')
  .action((category: string) =>
    withMonitor((monitor) => {
      const categories = Object.keys(DEFAULT_MODEL_CATALOG);
      if (!categories.includes(category))
        throw new Error(`Category must be one of: ${categories.join(', ')}.`);
      monitor.store.recordEvent('model.switch_requested', `Requested category: ${category}`);
      print({
        requested: category,
        applied: false,
        note: 'Model changes always require explicit user confirmation in your AI tool.',
      });
    }),
  );
program
  .command('model-rules')
  .description('Show the configurable model catalog and scoring thresholds.')
  .action(() =>
    print({
      catalog: DEFAULT_MODEL_CATALOG,
      scoreThresholds: {
        '0-30': 'fast_cheap',
        '31-60': 'standard_code',
        '61-80': 'advanced_code',
        '81-100': 'premium_reasoning',
      },
      note: 'Model names come from a configurable catalog, not hard-coded provider names.',
    }),
  );

program
  .command('web')
  .description('Start the local dashboard at http://localhost:3579.')
  .option('-p, --port <port>', 'port', '3579')
  .action(async (options: { port: string }) => {
    const { startLocalServer } = await import('@codinfy/agent-monitor-server');
    const monitor = new AgentMonitor(program.opts<{ project: string }>().project);
    const app = await startLocalServer({ monitor, port: Number(options.port) });
    console.log(
      `${chalk.green('✓')} Dashboard: http://localhost:${options.port}/dashboard\n${CODINFY_ATTRIBUTION.signature}`,
    );
    const close = async () => {
      await app.close();
      monitor.close();
    };
    process.once('SIGINT', () => void close());
    process.once('SIGTERM', () => void close());
  });
program
  .command('mcp')
  .description('Start the codinfy-agent-monitor MCP server over stdio.')
  .action(async () => {
    const { startMcpServer } = await import('@codinfy/agent-monitor-mcp');
    return startMcpServer(new AgentMonitor(program.opts<{ project: string }>().project));
  });

program.action(() =>
  withMonitor(
    (monitor) => print(renderSnapshot(monitor.snapshot(), monitor.language)),
    program.opts<{ project: string }>().project,
  ),
);

export async function runCli(argv = process.argv): Promise<void> {
  try {
    await program.parseAsync(argv);
  } catch (error) {
    console.error(chalk.red(redactSecrets(error instanceof Error ? error.message : String(error))));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void runCli();
