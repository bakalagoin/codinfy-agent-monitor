import type {
  Agent,
  ModelAdvice,
  ModelCategory,
  ObserverBlocker,
  ObserverReport,
  TimelineEvent,
  UsageMetric,
} from './types.js';

export const CODIX_OBSERVER_NAME = 'Codix Observer';

const COST_RANK: Record<ModelCategory, number> = {
  local_model: 0,
  fast_cheap: 1,
  standard_code: 2,
  debug_model: 3,
  vision_model: 4,
  advanced_code: 5,
  security_model: 6,
  premium_reasoning: 7,
};

export interface ObserverInput {
  agents: Agent[];
  metrics: Record<UsageMetric['name'], UsageMetric>;
  timeline: TimelineEvent[];
  advice: ModelAdvice;
  currentCategory?: ModelCategory;
  sensitiveFiles?: number;
  now?: number;
  idleMinutes?: number;
}

/**
 * Codix Observer: derive blockers and contextual recommendations from a session
 * snapshot. Pure and deterministic so it can be unit-tested without a database.
 */
export function analyzeObserver(input: ObserverInput): ObserverReport {
  const now = input.now ?? Date.now();
  const idleMinutes = input.idleMinutes ?? 10;
  const idleMs = idleMinutes * 60_000;
  const blockers: ObserverBlocker[] = [];
  const recommendations: string[] = [];

  for (const agent of input.agents) {
    const stalled =
      (agent.status === 'idle' || agent.status === 'blocked') &&
      now - Date.parse(agent.updatedAt) > idleMs;
    if (agent.status === 'error')
      blockers.push({
        kind: 'agent_error',
        severity: 'critical',
        message: `${agent.name} reported an error.`,
        agentId: agent.id,
      });
    else if (agent.status === 'blocked')
      blockers.push({
        kind: 'blocked_agent',
        severity: 'critical',
        message: `${agent.name} is blocked${stalled ? ` (over ${idleMinutes} min)` : ''}.`,
        agentId: agent.id,
      });
    else if (stalled)
      blockers.push({
        kind: 'stalled_agent',
        severity: 'warning',
        message: `${agent.name} has been idle for over ${idleMinutes} min.`,
        agentId: agent.id,
      });
  }

  const fileReads = new Map<string, number>();
  const failedCommands = new Map<string, number>();
  let rateLimitHits = 0;
  for (const event of input.timeline) {
    const type = event.type.toLowerCase();
    const file = typeof event.metadata?.file === 'string' ? event.metadata.file : '';
    if (type.includes('file') && type.includes('read') && file)
      fileReads.set(file, (fileReads.get(file) ?? 0) + 1);
    if (
      (type.includes('command') || type.startsWith('check.')) &&
      event.metadata?.success === false
    ) {
      const command =
        typeof event.metadata?.command === 'string' ? event.metadata.command : event.message;
      failedCommands.set(command, (failedCommands.get(command) ?? 0) + 1);
    }
    if (/429|rate.?limit/i.test(`${event.type} ${event.message}`)) rateLimitHits += 1;
  }
  for (const [file, count] of fileReads)
    if (count >= 3)
      blockers.push({
        kind: 'repeated_file_read',
        severity: 'warning',
        message: `${file} was read ${count} times; cache the context instead of re-reading.`,
      });
  for (const [command, count] of failedCommands)
    if (count >= 2)
      blockers.push({
        kind: 'repeated_command_failure',
        severity: 'critical',
        message: `A command failed ${count} times: ${command}`,
      });
  if (rateLimitHits >= 2)
    blockers.push({
      kind: 'rate_limit',
      severity: 'critical',
      message: `Repeated rate-limit/429 events detected (${rateLimitHits}). Slow down or switch model.`,
    });

  if ((input.metrics.context?.value ?? 0) > 80)
    recommendations.push(
      'Context usage is high; generate a memory summary and compact context before continuing.',
    );
  if ((input.metrics.daily?.value ?? 0) > 80 || (input.metrics.weekly?.value ?? 0) > 80)
    recommendations.push(
      'Usage limit is high; prefer an economical model category and batch small tasks.',
    );

  const current = input.currentCategory;
  if (
    current &&
    COST_RANK[current] > COST_RANK[input.advice.recommendedCategory] + 1 &&
    input.advice.score <= 30
  )
    recommendations.push(
      `The current model seems too powerful for this task. Consider ${input.advice.recommendedCategory} to save credits (confirmation required).`,
    );
  if (input.advice.score >= 81 && current && COST_RANK[current] < COST_RANK.advanced_code)
    recommendations.push(
      'This work looks complex or high-risk; a stronger reasoning model may reduce errors.',
    );

  const hasSecurityAgent = input.agents.some((agent) =>
    /security/i.test(`${agent.role} ${agent.name}`),
  );
  if ((input.sensitiveFiles ?? 0) > 0 && !hasSecurityAgent)
    recommendations.push(
      'Sensitive files changed but no Security Agent is active; consider a security review (RBAC, auth, secrets).',
    );

  if (blockers.length)
    recommendations.push('Resolve the detected blockers before adding new work.');
  recommendations.push(...input.advice.reasons);

  return {
    observer: CODIX_OBSERVER_NAME,
    blockers,
    recommendations: [...new Set(recommendations)],
  };
}
