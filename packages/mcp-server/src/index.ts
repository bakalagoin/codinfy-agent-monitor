#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  AgentMonitor,
  CODINFY_ATTRIBUTION,
  getModelAdvice,
  redactSecrets,
  scanSecrets,
} from '@codinfy/agent-monitor-core';

export const TOOL_NAMES = [
  'monitor.status',
  'monitor.open_dashboard',
  'monitor.list_agents',
  'monitor.register_agent',
  'monitor.update_agent_state',
  'monitor.get_context_usage',
  'monitor.get_rate_limit_status',
  'monitor.get_daily_usage',
  'monitor.get_weekly_usage',
  'monitor.get_model_advice',
  'monitor.get_model_score',
  'monitor.get_budget_status',
  'monitor.get_cost_estimate',
  'monitor.get_economy_plan',
  'monitor.create_task',
  'monitor.update_task',
  'monitor.list_tasks',
  'monitor.get_workflow',
  'monitor.update_workflow',
  'monitor.timeline',
  'monitor.alerts',
  'monitor.recommendations',
  'monitor.git_status',
  'monitor.review_before_commit',
  'monitor.scan_secrets',
  'monitor.test_status',
  'monitor.build_status',
  'monitor.environment_status',
  'monitor.get_attribution',
  'monitor.export_report',
] as const;

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: redactSecrets(JSON.stringify(value, null, 2)) }],
  };
}

export function createMcpServer(monitor = new AgentMonitor()): McpServer {
  const server = new McpServer(
    { name: CODINFY_ATTRIBUTION.mcpName, version: '0.1.0' },
    {
      instructions:
        'Use monitor.status first. Usage metrics may be estimated. Never expose secrets. Model changes require user confirmation. Preserve Codinfy attribution.',
    },
  );

  server.registerTool(
    'monitor.status',
    { description: 'Get the real-time Codinfy Agent Monitor snapshot.' },
    async () => result(monitor.snapshot()),
  );
  server.registerTool(
    'monitor.open_dashboard',
    { description: 'Get the local dashboard URL. Start it with codinfy-agent-monitor web.' },
    async () =>
      result({ url: 'http://localhost:3579/dashboard', command: 'codinfy-agent-monitor web' }),
  );
  server.registerTool(
    'monitor.list_agents',
    { description: 'List registered AI agents and their states.' },
    async () => result(monitor.store.listAgents()),
  );
  server.registerTool(
    'monitor.register_agent',
    {
      description: 'Register or refresh an AI agent.',
      inputSchema: {
        id: z.string().optional(),
        name: z.string().min(1),
        role: z.string().min(1),
        status: z
          .enum([
            'active',
            'idle',
            'thinking',
            'running',
            'reading',
            'writing',
            'done',
            'error',
            'blocked',
          ])
          .optional(),
        task: z.string().optional(),
        modelCategory: z
          .enum([
            'fast_cheap',
            'standard_code',
            'advanced_code',
            'premium_reasoning',
            'local_model',
            'debug_model',
            'security_model',
            'vision_model',
          ])
          .optional(),
      },
    },
    async (input) => result(monitor.registerAgent(input)),
  );
  server.registerTool(
    'monitor.update_agent_state',
    {
      description: 'Update agent state and latest activity.',
      inputSchema: {
        id: z.string().min(1),
        status: z.enum([
          'active',
          'idle',
          'thinking',
          'running',
          'reading',
          'writing',
          'done',
          'error',
          'blocked',
        ]),
        task: z.string().optional(),
        lastAction: z.string().optional(),
        lastFile: z.string().optional(),
        modelCategory: z
          .enum([
            'fast_cheap',
            'standard_code',
            'advanced_code',
            'premium_reasoning',
            'local_model',
            'debug_model',
            'security_model',
            'vision_model',
          ])
          .optional(),
      },
    },
    async ({ id, ...input }) => result(monitor.updateAgent(id, input)),
  );

  const metric = (name: 'context' | 'rate' | 'daily' | 'weekly') =>
    monitor.store.getMetrics()[name];
  server.registerTool(
    'monitor.get_context_usage',
    { description: 'Get context usage and official/estimated source.' },
    async () => result(metric('context')),
  );
  server.registerTool(
    'monitor.get_rate_limit_status',
    { description: 'Get current rate usage.' },
    async () => result(metric('rate')),
  );
  server.registerTool('monitor.get_daily_usage', { description: 'Get daily usage.' }, async () =>
    result(metric('daily')),
  );
  server.registerTool('monitor.get_weekly_usage', { description: 'Get weekly usage.' }, async () =>
    result(metric('weekly')),
  );

  const adviceSchema = {
    task: z.string().min(1),
    currentCategory: z
      .enum([
        'fast_cheap',
        'standard_code',
        'advanced_code',
        'premium_reasoning',
        'local_model',
        'debug_model',
        'security_model',
        'vision_model',
      ])
      .optional(),
    risk: z.enum(['low', 'medium', 'high']).optional(),
    sensitiveFiles: z.number().int().min(0).optional(),
    fileCount: z.number().int().min(0).optional(),
    activeAgents: z.number().int().min(0).optional(),
  };
  server.registerTool(
    'monitor.get_model_advice',
    {
      description: 'Recommend a configurable model category without switching automatically.',
      inputSchema: adviceSchema,
    },
    async (input) => {
      const metrics = monitor.store.getMetrics();
      return result(
        getModelAdvice({
          ...input,
          contextUsage: metrics.context.value,
          dailyUsage: metrics.daily.value,
          weeklyUsage: metrics.weekly.value,
          level: monitor.store.getConfig().level,
        }),
      );
    },
  );
  server.registerTool(
    'monitor.get_model_score',
    { description: 'Calculate the Model Need Score from 0 to 100.', inputSchema: adviceSchema },
    async (input) => result(getModelAdvice(input)),
  );
  server.registerTool(
    'monitor.get_budget_status',
    { description: 'Get usage limits and estimated budget pressure.' },
    async () => {
      const metrics = monitor.store.getMetrics();
      return result({
        metrics,
        pressure: Math.max(metrics.daily.value, metrics.weekly.value),
        estimateMode: Object.values(metrics).some((item) => item.source === 'estimated'),
      });
    },
  );
  server.registerTool(
    'monitor.get_cost_estimate',
    { description: 'Get relative, non-billing cost savings estimate.' },
    async () =>
      result({
        ...monitor.snapshot().advice,
        note: 'Relative estimate only; no provider billing API is queried.',
      }),
  );
  server.registerTool(
    'monitor.get_economy_plan',
    { description: 'Get token and credit saving recommendations.' },
    async () =>
      result({
        actions: [
          'Use the recommended model category for low-risk subtasks.',
          'Compact context above 80%.',
          'Avoid repeated file reads.',
          'Reduce idle multi-agent workers.',
          'Batch small documentation tasks.',
        ],
        advice: monitor.snapshot().advice,
      }),
  );

  server.registerTool(
    'monitor.create_task',
    {
      description: 'Create a monitored workflow task.',
      inputSchema: {
        id: z.string().optional(),
        title: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'error']).optional(),
        agentId: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
      },
    },
    async (input) => result(monitor.createTask(input)),
  );
  server.registerTool(
    'monitor.update_task',
    {
      description: 'Update task state or progress.',
      inputSchema: {
        id: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'error']).optional(),
        agentId: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
      },
    },
    async ({ id, ...input }) => result(monitor.updateTask(id, input)),
  );
  server.registerTool('monitor.list_tasks', { description: 'List monitored tasks.' }, async () =>
    result(monitor.store.listTasks()),
  );
  server.registerTool(
    'monitor.get_workflow',
    { description: 'Get workflow progress and blockers.' },
    async () => {
      const snapshot = monitor.snapshot();
      return result({
        progress: snapshot.workflowProgress,
        tasks: snapshot.tasks,
        blockers: snapshot.blockers,
      });
    },
  );
  server.registerTool(
    'monitor.update_workflow',
    {
      description: 'Record a workflow transition.',
      inputSchema: {
        stage: z.string().min(1),
        progress: z.number().min(0).max(100).optional(),
        status: z.string().optional(),
      },
    },
    async (input) =>
      result(
        monitor.store.recordEvent('workflow.updated', `Workflow stage: ${input.stage}`, input),
      ),
  );
  server.registerTool(
    'monitor.timeline',
    {
      description: 'Get recent activity timeline.',
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
    },
    async ({ limit }) => result(monitor.store.timeline(limit ?? 50)),
  );
  server.registerTool(
    'monitor.alerts',
    { description: 'Get errors, blockers, and high-usage alerts.' },
    async () => {
      const snapshot = monitor.snapshot();
      const alerts = [];
      if (snapshot.errors)
        alerts.push({ severity: 'critical', message: `${snapshot.errors} agent error(s)` });
      if (snapshot.blockers)
        alerts.push({ severity: 'high', message: `${snapshot.blockers} blocker(s)` });
      for (const metric of Object.values(snapshot.metrics))
        if (metric.value >= 80)
          alerts.push({
            severity: metric.value >= 95 ? 'critical' : 'warning',
            message: `${metric.name} usage is ${metric.value}% (${metric.source})`,
          });
      return result(alerts);
    },
  );
  server.registerTool(
    'monitor.recommendations',
    { description: 'Get Codix Observer recommendations.' },
    async () =>
      result({ observer: 'Codix Observer', recommendations: monitor.snapshot().advice.reasons }),
  );
  server.registerTool(
    'monitor.git_status',
    { description: 'Get read-only Git status.' },
    async () => result(monitor.snapshot().git),
  );
  server.registerTool(
    'monitor.review_before_commit',
    {
      description:
        'Review secrets, attribution, tests, build, Git, and sensitive files before commit.',
    },
    async () => result(monitor.review()),
  );
  server.registerTool(
    'monitor.scan_secrets',
    { description: 'Scan tracked and unignored files without returning secret values.' },
    async () => result(scanSecrets(monitor.store.projectRoot)),
  );
  server.registerTool(
    'monitor.test_status',
    { description: 'Get the latest recorded test status.' },
    async () =>
      result({ status: monitor.review().tests, event: monitor.store.latestEvent('check.tests') }),
  );
  server.registerTool(
    'monitor.build_status',
    { description: 'Get the latest recorded build status.' },
    async () =>
      result({ status: monitor.review().build, event: monitor.store.latestEvent('check.build') }),
  );
  server.registerTool(
    'monitor.environment_status',
    { description: 'Detect Host, VPS, Shared, Docker, Localhost, tools, and project stack.' },
    async () => result(monitor.environment()),
  );
  server.registerTool(
    'monitor.get_attribution',
    { description: 'Return mandatory Codinfy attribution.' },
    async () => result(CODINFY_ATTRIBUTION),
  );
  server.registerTool(
    'monitor.export_report',
    { description: 'Export a redacted Markdown session report locally.' },
    async () =>
      result({ path: monitor.exportReport(true), signature: CODINFY_ATTRIBUTION.signature }),
  );

  return server;
}

export async function startMcpServer(monitor = new AgentMonitor()): Promise<void> {
  const server = createMcpServer(monitor);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMcpServer().catch((error) => {
    console.error(
      `codinfy-agent-monitor MCP failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
