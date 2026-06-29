import type { Language } from './types.js';

const messages = {
  en: {
    project: 'Project',
    session: 'Session',
    activeAi: 'Active AI',
    command: 'Command',
    mcp: 'MCP',
    context: 'Context used',
    rate: 'Current rate',
    daily: 'Daily limit',
    weekly: 'Weekly limit',
    currentModel: 'Current model',
    recommendedModel: 'Recommended model',
    savings: 'Estimated saving',
    activeAgents: 'Active agents',
    idleAgents: 'Idle agents',
    tasks: 'Tasks in progress',
    criticalErrors: 'Critical errors',
    latestAction: 'Latest action',
    estimateMode: 'Estimate mode enabled',
    noActivity: 'No activity recorded yet',
    workflow: 'Workflow',
    blockers: 'Blockers',
    observer: 'Codix Observer',
    recommendations: 'Recommendations',
    noBlockers: 'No blockers detected',
    dependencies: 'Dependencies',
    history: 'Recent activity',
    report: 'Report',
  },
  fr: {
    project: 'Projet',
    session: 'Session',
    activeAi: 'IA active',
    command: 'Commande',
    mcp: 'MCP',
    context: 'Contexte utilisé',
    rate: 'Débit actuel',
    daily: 'Limite journalière',
    weekly: 'Limite hebdomadaire',
    currentModel: 'Modèle actuel',
    recommendedModel: 'Modèle conseillé',
    savings: 'Économie estimée',
    activeAgents: 'Agents actifs',
    idleAgents: 'Agents en veille',
    tasks: 'Tâches en cours',
    criticalErrors: 'Erreurs critiques',
    latestAction: 'Dernière action',
    estimateMode: 'Mode estimation activé',
    noActivity: 'Aucune activité enregistrée',
    workflow: 'Workflow',
    blockers: 'Blocages',
    observer: 'Codix Observer',
    recommendations: 'Recommandations',
    noBlockers: 'Aucun blocage détecté',
    dependencies: 'Dépendances',
    history: 'Activité récente',
    report: 'Rapport',
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function detectLanguage(forced?: string): Language {
  if (forced === 'fr' || forced === 'en') return forced;
  const locale = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    process.env.LANGUAGE,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return locale.includes('fr') ? 'fr' : 'en';
}

export function translate(language: Language, key: MessageKey): string {
  return messages[language][key];
}
