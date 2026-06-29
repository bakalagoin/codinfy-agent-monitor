import React, { useEffect, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import {
  CODINFY_ATTRIBUTION,
  sanitizeTerminalText,
  translate,
  type AgentMonitor,
  type Language,
  type MonitorSnapshot,
} from '@codinfy/agent-monitor-core';

function bar(value: number, frame = 0, width = 20): string {
  const normalized = Math.max(0, Math.min(100, value));
  const filled = Math.round((normalized / 100) * width);
  const pulse = frame % 2 === 0 ? '█' : '▓';
  return `${'█'.repeat(Math.max(0, filled - 1))}${filled > 0 ? pulse : ''}${'░'.repeat(width - filled)} ${Math.round(normalized)}%`;
}

function Metric({
  label,
  value,
  source,
  frame,
}: {
  label: string;
  value: number;
  source: string;
  frame: number;
}) {
  const color = value >= 90 ? 'red' : value >= 75 ? 'yellow' : 'green';
  return (
    <Text>
      {label.padEnd(22)} <Text color={color}>{bar(value, frame)}</Text>{' '}
      <Text dimColor>({source})</Text>
    </Text>
  );
}

export function Dashboard({ monitor }: { monitor: AgentMonitor }) {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(() => monitor.snapshot());
  const [frame, setFrame] = useState(0);
  const language = monitor.language;
  const safe = sanitizeTerminalText;
  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(monitor.snapshot());
      setFrame((value) => value + 1);
    }, 800);
    return () => clearInterval(timer);
  }, [monitor]);
  useInput((input) => {
    if (input === 'q') exit();
    if (input === 'r') setSnapshot(monitor.snapshot());
  });
  const active = snapshot.agents.filter((agent) =>
    ['active', 'thinking', 'running', 'reading', 'writing'].includes(agent.status),
  ).length;
  const idle = snapshot.agents.filter((agent) => agent.status === 'idle').length;
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          Codinfy Agent Monitor
        </Text>
        <Text>
          {translate(language, 'project')}: {safe(snapshot.project)} ·{' '}
          {translate(language, 'session')}: {safe(snapshot.session)}
        </Text>
        <Text>
          {translate(language, 'activeAi')}: {safe(snapshot.tool)} ·{' '}
          {translate(language, 'command')}: /codinfy · MCP: codinfy-agent-monitor
        </Text>
        <Text> </Text>
        <Metric
          label={translate(language, 'context')}
          value={snapshot.metrics.context.value}
          source={snapshot.metrics.context.source}
          frame={frame}
        />
        <Metric
          label={translate(language, 'rate')}
          value={snapshot.metrics.rate.value}
          source={snapshot.metrics.rate.source}
          frame={frame}
        />
        <Metric
          label={translate(language, 'daily')}
          value={snapshot.metrics.daily.value}
          source={snapshot.metrics.daily.source}
          frame={frame}
        />
        <Metric
          label={translate(language, 'weekly')}
          value={snapshot.metrics.weekly.value}
          source={snapshot.metrics.weekly.source}
          frame={frame}
        />
        {snapshot.estimateMode && <Text color="yellow">{translate(language, 'estimateMode')}</Text>}
        <Text> </Text>
        <Text bold color="magenta">
          AI Credit Saver & Smart Model Router
        </Text>
        <Text>
          {translate(language, 'currentModel')}: {safe(snapshot.currentModel)}
        </Text>
        <Text>
          {translate(language, 'recommendedModel')}: {snapshot.advice.recommendedCategory} · Score{' '}
          {snapshot.advice.score}/100
        </Text>
        <Text>
          {translate(language, 'savings')}: {snapshot.advice.estimatedCostSavingPercent}% ·
          confirmation required
        </Text>
        <Text> </Text>
        <Text>
          {translate(language, 'activeAgents')}: {active} · {translate(language, 'idleAgents')}:{' '}
          {idle} · {translate(language, 'tasks')}:{' '}
          {snapshot.tasks.filter((task) => task.status === 'in_progress').length}
        </Text>
        <Text>
          {translate(language, 'workflow')}: {bar(snapshot.workflowProgress, frame, 20)}
        </Text>
        <Text>
          {translate(language, 'criticalErrors')}: {snapshot.errors} ·{' '}
          {translate(language, 'blockers')}: {snapshot.blockers}
        </Text>
        <Text>
          {translate(language, 'latestAction')}: {safe(snapshot.latestAction)}
        </Text>
        <Text dimColor>Press r to refresh · q to quit</Text>
      </Box>
      <Text color="cyan"> {CODINFY_ATTRIBUTION.signature}</Text>
    </Box>
  );
}

export function renderSnapshot(snapshot: MonitorSnapshot, language: Language = 'en'): string {
  const safe = sanitizeTerminalText;
  const active = snapshot.agents.filter((agent) =>
    ['active', 'thinking', 'running', 'reading', 'writing'].includes(agent.status),
  ).length;
  const idle = snapshot.agents.filter((agent) => agent.status === 'idle').length;
  return [
    '╭────────────────── Codinfy Agent Monitor ──────────────────╮',
    `${translate(language, 'project')}: ${safe(snapshot.project)}`,
    `${translate(language, 'session')}: ${safe(snapshot.session)}`,
    `${translate(language, 'activeAi')}: ${safe(snapshot.tool)}`,
    `${translate(language, 'command')}: /codinfy · MCP: codinfy-agent-monitor`,
    '├────────────────────────────────────────────────────────────┤',
    `${translate(language, 'context').padEnd(22)} ${bar(snapshot.metrics.context.value)} (${snapshot.metrics.context.source})`,
    `${translate(language, 'rate').padEnd(22)} ${bar(snapshot.metrics.rate.value)} (${snapshot.metrics.rate.source})`,
    `${translate(language, 'daily').padEnd(22)} ${bar(snapshot.metrics.daily.value)} (${snapshot.metrics.daily.source})`,
    `${translate(language, 'weekly').padEnd(22)} ${bar(snapshot.metrics.weekly.value)} (${snapshot.metrics.weekly.source})`,
    ...(snapshot.estimateMode ? [`⚠ ${translate(language, 'estimateMode')}`] : []),
    '├──────────────── AI Credit Saver & Smart Model Router ──────┤',
    `${translate(language, 'currentModel')}: ${safe(snapshot.currentModel)}`,
    `${translate(language, 'recommendedModel')}: ${snapshot.advice.recommendedCategory} (score ${snapshot.advice.score}/100)`,
    `${translate(language, 'savings')}: ${snapshot.advice.estimatedCostSavingPercent}% · confirmation required`,
    '├────────────────────────────────────────────────────────────┤',
    `${translate(language, 'activeAgents')}: ${active} · ${translate(language, 'idleAgents')}: ${idle}`,
    `${translate(language, 'workflow')}: ${bar(snapshot.workflowProgress)}`,
    `${translate(language, 'criticalErrors')}: ${snapshot.errors} · ${translate(language, 'blockers')}: ${snapshot.blockers}`,
    `${translate(language, 'latestAction')}: ${safe(snapshot.latestAction)}`,
    '╰────────────────────────────────────────────────────────────╯',
    `  ${CODINFY_ATTRIBUTION.signature}`,
  ].join('\n');
}

export async function runTui(monitor: AgentMonitor): Promise<void> {
  const instance = render(<Dashboard monitor={monitor} />, { exitOnCtrlC: true });
  await instance.waitUntilExit();
}
