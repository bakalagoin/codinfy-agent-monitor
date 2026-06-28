export type AgentStatus =
  'active' | 'idle' | 'thinking' | 'running' | 'reading' | 'writing' | 'done' | 'error' | 'blocked';

export type ModelCategory =
  | 'fast_cheap'
  | 'standard_code'
  | 'advanced_code'
  | 'premium_reasoning'
  | 'local_model'
  | 'debug_model'
  | 'security_model'
  | 'vision_model';

export type UserLevel = 'beginner' | 'intermediate' | 'expert';
export type Language = 'fr' | 'en';
export type MetricSource = 'official' | 'estimated';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  task?: string;
  modelCategory?: ModelCategory;
  color?: string;
  lastAction?: string;
  lastFile?: string;
  startedAt: string;
  updatedAt: string;
}

export interface MonitorTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'error';
  agentId?: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: number;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UsageMetric {
  name: 'context' | 'rate' | 'daily' | 'weekly';
  value: number;
  source: MetricSource;
  updatedAt: string;
}

export interface ModelAdviceInput {
  task: string;
  currentCategory?: ModelCategory;
  risk?: 'low' | 'medium' | 'high';
  sensitiveFiles?: number;
  fileCount?: number;
  activeAgents?: number;
  contextUsage?: number;
  dailyUsage?: number;
  weeklyUsage?: number;
  recentErrors?: number;
  level?: UserLevel;
}

export interface ModelAdvice {
  score: number;
  recommendedCategory: ModelCategory;
  currentCategory?: ModelCategory;
  estimatedTokenSavingPercent: number;
  estimatedCostSavingPercent: number;
  reasons: string[];
  requiresConfirmation: true;
}

export interface GitSummary {
  available: boolean;
  branch: string;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  untracked: number;
  files: string[];
  remote?: string;
  lastCommit?: string;
  error?: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
  preview: string;
  severity: 'medium' | 'high' | 'critical';
}

export interface EnvironmentStatus {
  type:
    | 'Shared Hosting'
    | 'VPS'
    | 'Dedicated Server'
    | 'Docker'
    | 'Localhost'
    | 'Cloud Server'
    | 'cPanel'
    | 'Plesk'
    | 'Hestia'
    | 'Forge'
    | 'Coolify'
    | 'Other';
  os: string;
  shell: string;
  tools: Record<string, string | null>;
  longRunningProcesses: boolean;
  detectedStacks: string[];
}

export interface MonitorSnapshot {
  project: string;
  session: string;
  tool: string;
  currentModel: string;
  metrics: Record<UsageMetric['name'], UsageMetric>;
  agents: Agent[];
  tasks: MonitorTask[];
  workflowProgress: number;
  timeline: TimelineEvent[];
  git: GitSummary;
  advice: ModelAdvice;
  errors: number;
  blockers: number;
  latestAction: string;
  estimateMode: boolean;
}

export interface ReviewResult {
  ready: boolean;
  secretFindings: SecretFinding[];
  attributionMissing: Record<string, string[]>;
  git: GitSummary;
  tests: 'passed' | 'failed' | 'not_run';
  build: 'passed' | 'failed' | 'not_run';
  sensitiveFiles: string[];
  notes: string[];
}
