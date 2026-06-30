import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { redactSecrets } from './security.js';
import type {
  Agent,
  AgentStatus,
  MetricSource,
  ModelCategory,
  MonitorTask,
  TimelineEvent,
  UsageMetric,
} from './types.js';

const updateSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  checkOnStartup: z.boolean().default(true),
  checkIntervalHours: z.number().int().min(1).max(168).default(12),
  channel: z.enum(['stable', 'prerelease']).default('stable'),
  autoInstall: z.literal(false).default(false),
  notifyPrerelease: z.boolean().default(false),
  repository: z
    .string()
    .regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i)
    .default('bakalagoin/codinfy-agent-monitor'),
});

const notificationSettingsSchema = z.object({
  updates: z.boolean().default(true),
  portConflicts: z.boolean().default(true),
  orphanProcesses: z.boolean().default(true),
  resourceWarnings: z.boolean().default(true),
  desktop: z.boolean().default(false),
});

const configSchema = z.object({
  projectName: z.string().min(1).max(240),
  sessionName: z.string().min(1).max(240).default('Local monitoring'),
  tool: z.string().min(1).max(240).default('MCP-compatible tool'),
  currentModel: z.string().min(1).max(240).default('Not reported'),
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
    .default('standard_code'),
  language: z.enum(['auto', 'fr', 'en']).default('auto'),
  level: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  safeGuard: z.boolean().default(true),
  updates: updateSettingsSchema.default({
    enabled: true,
    checkOnStartup: true,
    checkIntervalHours: 12,
    channel: 'stable',
    autoInstall: false,
    notifyPrerelease: false,
    repository: 'bakalagoin/codinfy-agent-monitor',
  }),
  notifications: notificationSettingsSchema.default({
    updates: true,
    portConflicts: true,
    orphanProcesses: true,
    resourceWarnings: true,
    desktop: false,
  }),
});

export type MonitorConfig = z.infer<typeof configSchema>;

function assertNotSymbolicLink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error(`Refusing symbolic link for local monitor storage: ${path}`);
}

function redactValue<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}

function redactText(value: string): string {
  return redactSecrets(value);
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  task: string | null;
  model_category: ModelCategory | null;
  color: string | null;
  last_action: string | null;
  last_file: string | null;
  started_at: string;
  updated_at: string;
}
interface TaskRow {
  id: string;
  title: string;
  status: MonitorTask['status'];
  agent_id: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
}
interface EventRow {
  id: number;
  type: string;
  message: string;
  metadata: string | null;
  created_at: string;
}
interface MetricRow {
  name: UsageMetric['name'];
  value: number;
  source: MetricSource;
  updated_at: string;
}

export class MonitorStore {
  readonly projectRoot: string;
  readonly dataRoot: string;
  readonly configPath: string;
  readonly databasePath: string;
  private readonly db: DatabaseSync;

  constructor(projectRoot = process.cwd(), dataRoot?: string) {
    this.projectRoot = resolve(projectRoot);
    this.dataRoot = resolve(dataRoot ?? join(this.projectRoot, '.codinfy-agent-monitor'));
    this.configPath = join(this.dataRoot, 'config.json');
    this.databasePath = join(this.dataRoot, 'metrics.sqlite');
    assertNotSymbolicLink(this.dataRoot);
    this.ensureDirectories();
    assertNotSymbolicLink(this.configPath);
    assertNotSymbolicLink(this.databasePath);
    this.db = new DatabaseSync(this.databasePath);
    try {
      chmodSync(this.databasePath, 0o600);
    } catch {
      /* best effort on platforms without POSIX modes */
    }
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
    this.getConfig();
    this.ensureDefaultMetrics();
  }

  private ensureDirectories(): void {
    for (const directory of [
      '',
      'sessions',
      'agents',
      'workflows',
      'logs',
      'reports',
      'cache',
      'backups',
    ]) {
      const path = join(this.dataRoot, directory);
      assertNotSymbolicLink(path);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      assertNotSymbolicLink(path);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
        task TEXT, model_category TEXT, color TEXT, last_action TEXT, last_file TEXT,
        started_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, agent_id TEXT,
        progress INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, message TEXT NOT NULL,
        metadata TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metrics (
        name TEXT PRIMARY KEY, value REAL NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
  }

  private ensureDefaultMetrics(): void {
    for (const name of ['context', 'rate', 'daily', 'weekly'] as const) {
      const exists = this.db.prepare('SELECT name FROM metrics WHERE name = ?').get(name);
      if (!exists) this.setMetric(name, 0, 'estimated');
    }
  }

  getConfig(): MonitorConfig {
    const defaults: MonitorConfig = {
      projectName: basename(this.projectRoot),
      sessionName: 'Local monitoring',
      tool: 'MCP-compatible tool',
      currentModel: 'Not reported',
      currentCategory: 'standard_code',
      language: 'auto',
      level: 'intermediate',
      safeGuard: true,
      updates: {
        enabled: true,
        checkOnStartup: true,
        checkIntervalHours: 12,
        channel: 'stable',
        autoInstall: false,
        notifyPrerelease: false,
        repository: 'bakalagoin/codinfy-agent-monitor',
      },
      notifications: {
        updates: true,
        portConflicts: true,
        orphanProcesses: true,
        resourceWarnings: true,
        desktop: false,
      },
    };
    let config = defaults;
    if (existsSync(this.configPath)) {
      try {
        config = configSchema.parse(
          redactValue({
            ...defaults,
            ...JSON.parse(readFileSync(this.configPath, 'utf8')),
          }),
        );
      } catch {
        config = defaults;
      }
    }
    assertNotSymbolicLink(this.configPath);
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return config;
  }

  updateConfig(patch: Partial<MonitorConfig>): MonitorConfig {
    assertNotSymbolicLink(this.configPath);
    const config = configSchema.parse(redactValue({ ...this.getConfig(), ...patch }));
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    this.recordEvent('config.updated', 'Monitor configuration updated', {
      fields: Object.keys(patch),
    });
    return config;
  }

  registerAgent(input: {
    id?: string;
    name: string;
    role: string;
    status?: AgentStatus;
    task?: string;
    modelCategory?: ModelCategory;
    color?: string;
  }): Agent {
    const now = new Date().toISOString();
    const id = redactText(input.id ?? randomUUID()).slice(0, 240);
    this.db
      .prepare(
        `INSERT INTO agents (id,name,role,status,task,model_category,color,started_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,
      task=excluded.task,model_category=excluded.model_category,color=excluded.color,updated_at=excluded.updated_at`,
      )
      .run(
        id,
        redactText(input.name).slice(0, 240),
        redactText(input.role).slice(0, 240),
        input.status ?? 'active',
        input.task ? redactText(input.task).slice(0, 4_000) : null,
        input.modelCategory ?? null,
        input.color ? redactText(input.color).slice(0, 64) : null,
        now,
        now,
      );
    this.recordEvent('agent.registered', `${input.name} registered`, { id, role: input.role });
    return this.getAgent(id)!;
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as
      AgentRow | undefined;
    return row ? this.mapAgent(row) : undefined;
  }

  listAgents(): Agent[] {
    return (
      this.db
        .prepare('SELECT * FROM agents ORDER BY updated_at DESC')
        .all() as unknown as AgentRow[]
    ).map((row) => this.mapAgent(row));
  }

  updateAgent(
    id: string,
    patch: {
      status: AgentStatus;
      task?: string;
      lastAction?: string;
      lastFile?: string;
      modelCategory?: ModelCategory;
    },
  ): Agent {
    const current = this.getAgent(id);
    if (!current) throw new Error(`Agent not found: ${id}`);
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE agents SET status=?, task=?, last_action=?, last_file=?, model_category=?, updated_at=? WHERE id=?`,
      )
      .run(
        patch.status,
        patch.task !== undefined ? redactText(patch.task).slice(0, 4_000) : (current.task ?? null),
        patch.lastAction !== undefined
          ? redactText(patch.lastAction).slice(0, 8_000)
          : (current.lastAction ?? null),
        patch.lastFile !== undefined
          ? redactText(patch.lastFile).slice(0, 2_000)
          : (current.lastFile ?? null),
        patch.modelCategory ?? current.modelCategory ?? null,
        updatedAt,
        id,
      );
    this.recordEvent('agent.updated', `${current.name}: ${patch.status}`, { id, ...patch });
    return this.getAgent(id)!;
  }

  private mapAgent(row: AgentRow): Agent {
    return {
      id: row.id,
      name: redactText(row.name),
      role: redactText(row.role),
      status: row.status,
      ...(row.task ? { task: redactText(row.task) } : {}),
      ...(row.model_category ? { modelCategory: row.model_category } : {}),
      ...(row.color ? { color: redactText(row.color) } : {}),
      ...(row.last_action ? { lastAction: redactText(row.last_action) } : {}),
      ...(row.last_file ? { lastFile: redactText(row.last_file) } : {}),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
    };
  }

  createTask(input: {
    id?: string;
    title: string;
    status?: MonitorTask['status'];
    agentId?: string;
    progress?: number;
  }): MonitorTask {
    const now = new Date().toISOString();
    const id = redactText(input.id ?? randomUUID()).slice(0, 240);
    const progress = Math.max(0, Math.min(100, input.progress ?? 0));
    this.db
      .prepare(
        'INSERT INTO tasks (id,title,status,agent_id,progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        id,
        redactText(input.title).slice(0, 4_000),
        input.status ?? 'pending',
        input.agentId ?? null,
        progress,
        now,
        now,
      );
    this.recordEvent('task.created', input.title, { id });
    return this.getTask(id)!;
  }

  getTask(id: string): MonitorTask | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? this.mapTask(row) : undefined;
  }

  updateTask(
    id: string,
    patch: { status?: MonitorTask['status']; progress?: number; agentId?: string },
  ): MonitorTask {
    const current = this.getTask(id);
    if (!current) throw new Error(`Task not found: ${id}`);
    const status = patch.status ?? current.status;
    const progress = Math.max(
      0,
      Math.min(100, patch.progress ?? (status === 'completed' ? 100 : current.progress)),
    );
    this.db
      .prepare('UPDATE tasks SET status=?, progress=?, agent_id=?, updated_at=? WHERE id=?')
      .run(
        status,
        progress,
        patch.agentId ?? current.agentId ?? null,
        new Date().toISOString(),
        id,
      );
    this.recordEvent('task.updated', `${current.title}: ${status}`, { id, progress });
    return this.getTask(id)!;
  }

  listTasks(): MonitorTask[] {
    return (
      this.db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all() as unknown as TaskRow[]
    ).map((row) => this.mapTask(row));
  }

  private mapTask(row: TaskRow): MonitorTask {
    return {
      id: row.id,
      title: redactText(row.title),
      status: row.status,
      ...(row.agent_id ? { agentId: row.agent_id } : {}),
      progress: row.progress,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  setMetric(name: UsageMetric['name'], value: number, source: MetricSource): UsageMetric {
    const updatedAt = new Date().toISOString();
    const normalized = Math.max(0, Math.min(100, value));
    this.db
      .prepare(
        'INSERT INTO metrics (name,value,source,updated_at) VALUES (?,?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,source=excluded.source,updated_at=excluded.updated_at',
      )
      .run(name, normalized, source, updatedAt);
    return { name, value: normalized, source, updatedAt };
  }

  getMetrics(): Record<UsageMetric['name'], UsageMetric> {
    const rows = this.db.prepare('SELECT * FROM metrics').all() as unknown as MetricRow[];
    const mapped = Object.fromEntries(
      rows.map((row) => [
        row.name,
        { name: row.name, value: row.value, source: row.source, updatedAt: row.updated_at },
      ]),
    );
    return mapped as Record<UsageMetric['name'], UsageMetric>;
  }

  recordEvent(type: string, message: string, metadata?: Record<string, unknown>): TimelineEvent {
    const createdAt = new Date().toISOString();
    const safeType = redactText(type).slice(0, 160);
    const safeMessage = redactText(message).slice(0, 8_000);
    const safeMetadata = metadata ? redactValue(metadata) : undefined;
    const result = this.db
      .prepare('INSERT INTO events (type,message,metadata,created_at) VALUES (?,?,?,?)')
      .run(safeType, safeMessage, safeMetadata ? JSON.stringify(safeMetadata) : null, createdAt);
    this.db.exec(
      'DELETE FROM events WHERE id <= (SELECT CASE WHEN MAX(id) > 10000 THEN MAX(id) - 10000 ELSE 0 END FROM events);',
    );
    return {
      id: Number(result.lastInsertRowid),
      type: safeType,
      message: safeMessage,
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
      createdAt,
    };
  }

  timeline(limit = 50): TimelineEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?')
      .all(Math.max(1, Math.min(500, limit))) as unknown as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      type: redactText(row.type),
      message: redactText(row.message),
      ...(row.metadata
        ? { metadata: redactValue(JSON.parse(row.metadata) as Record<string, unknown>) }
        : {}),
      createdAt: row.created_at,
    }));
  }

  latestEvent(type: string): TimelineEvent | undefined {
    const row = this.db
      .prepare('SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT 1')
      .get(type) as EventRow | undefined;
    return row
      ? {
          id: row.id,
          type: redactText(row.type),
          message: redactText(row.message),
          ...(row.metadata
            ? { metadata: redactValue(JSON.parse(row.metadata) as Record<string, unknown>) }
            : {}),
          createdAt: row.created_at,
        }
      : undefined;
  }

  reset(): void {
    this.db.exec('DELETE FROM agents; DELETE FROM tasks; DELETE FROM events; DELETE FROM metrics;');
    this.ensureDefaultMetrics();
    this.recordEvent('monitor.reset', 'Local monitoring data reset');
  }

  close(): void {
    this.db.close();
  }
}
