import type { ModelAdvice, ModelAdviceInput, ModelCategory } from './types.js';

const LOW_COMPLEXITY = [
  'readme',
  'documentation',
  'translate',
  'traduction',
  'format',
  'rename',
  'changelog',
  'checklist',
  'comment',
];
const HIGH_COMPLEXITY = [
  'architecture',
  'security',
  'sécurité',
  'rbac',
  'payment',
  'paiement',
  'license',
  'auth',
  'migration',
  'incident',
  'production',
  'massive refactor',
  'audit',
];

export const DEFAULT_MODEL_CATALOG: Record<ModelCategory, { label: string; relativeCost: number }> =
  {
    fast_cheap: { label: 'Fast / economical', relativeCost: 1 },
    standard_code: { label: 'Standard code', relativeCost: 2 },
    advanced_code: { label: 'Advanced code', relativeCost: 4 },
    premium_reasoning: { label: 'Premium reasoning', relativeCost: 8 },
    local_model: { label: 'Local model', relativeCost: 0.5 },
    debug_model: { label: 'Debug model', relativeCost: 3 },
    security_model: { label: 'Security model', relativeCost: 6 },
    vision_model: { label: 'Vision model', relativeCost: 5 },
  };

export function scoreModelNeed(input: ModelAdviceInput): number {
  const task = input.task.toLowerCase();
  let score = 40;
  if (LOW_COMPLEXITY.some((term) => task.includes(term))) score -= 25;
  if (HIGH_COMPLEXITY.some((term) => task.includes(term))) score += 35;
  if (input.risk === 'high') score += 25;
  if (input.risk === 'medium') score += 10;
  score += Math.min(15, (input.sensitiveFiles ?? 0) * 5);
  score += Math.min(10, Math.max(0, (input.fileCount ?? 1) - 3));
  if ((input.activeAgents ?? 0) > 3) score += 10;
  if ((input.recentErrors ?? 0) > 1) score += 10;
  if ((input.contextUsage ?? 0) > 80) score += 5;
  if (input.level === 'beginner') score += 5;
  return Math.max(0, Math.min(100, score));
}

export function categoryForScore(score: number): ModelCategory {
  if (score <= 30) return 'fast_cheap';
  if (score <= 60) return 'standard_code';
  if (score <= 80) return 'advanced_code';
  return 'premium_reasoning';
}

export function getModelAdvice(input: ModelAdviceInput): ModelAdvice {
  const score = scoreModelNeed(input);
  const recommendedCategory = categoryForScore(score);
  const currentCost = input.currentCategory
    ? DEFAULT_MODEL_CATALOG[input.currentCategory].relativeCost
    : DEFAULT_MODEL_CATALOG.standard_code.relativeCost;
  const recommendedCost = DEFAULT_MODEL_CATALOG[recommendedCategory].relativeCost;
  const saving =
    currentCost > recommendedCost
      ? Math.round(((currentCost - recommendedCost) / currentCost) * 100)
      : 0;
  const reasons = [
    `Model Need Score: ${score}/100`,
    `Task category recommends ${recommendedCategory}.`,
  ];
  if ((input.contextUsage ?? 0) > 80)
    reasons.push('Context usage is high; summarize before adding more work.');
  if ((input.dailyUsage ?? 0) > 80 || (input.weeklyUsage ?? 0) > 80)
    reasons.push('Usage limit is high; prefer an economical category for low-risk subtasks.');
  if (input.risk === 'high')
    reasons.push('High-risk work justifies stronger reasoning and mandatory human review.');
  return {
    score,
    recommendedCategory,
    ...(input.currentCategory ? { currentCategory: input.currentCategory } : {}),
    estimatedTokenSavingPercent: Math.max(0, Math.min(70, saving - 5)),
    estimatedCostSavingPercent: Math.max(0, Math.min(80, saving)),
    reasons,
    requiresConfirmation: true,
  };
}
