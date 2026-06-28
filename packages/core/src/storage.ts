import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type {
  Agent,
  AgentStatus,
  MetricSource,
  ModelCategory,
  MonitorTask,
  TimelineEvent,
  UsageMetric,
} from './types.js';

const configSchema = z.object({
  projectName: z.string().min(1),
  sessionName: z.string().min(1).default('Local monitoring'),
  tool: z.string().min(1).default('MCP-compatible tool'),
  currentModel: z.string().min(1).default('Not reported'),
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
});

export type MonitorConfig = z.infer<typeof configSchema>;

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
    this.ensureDirectories();
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
    this.getConfig();
    this.ensureDefaultMetrics();
  }

  private ensureDirectories(): void {
    for (const directory of ['', 'sessions', 'agents', 'workflows', 'logs', 'reports', 'cache'])
      mkdirSync(join(this.dataRoot, directory), { recursive: true });
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
    };
    let config = defaults;
    if (existsSync(this.configPath)) {
      try {
        config = configSchema.parse({
          ...defaults,
          ...JSON.parse(readFileSync(this.configPath, 'utf8')),
        });
      } catch {
        config = defaults;
      }
    }
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return config;
  }

  updateConfig(patch: Partial<MonitorConfig>): MonitorConfig {
    const config = configSchema.parse({ ...this.getConfig(), ...patch });
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
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO agents (id,name,role,status,task,model_category,color,started_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,
      task=excluded.task,model_category=excluded.model_category,color=excluded.color,updated_at=excluded.updated_at`,
      )
      .run(
        id,
        input.name,
        input.role,
        input.status ?? 'active',
        input.task ?? null,
        input.modelCategory ?? null,
        input.color ?? null,
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
        patch.task ?? current.task ?? null,
        patch.lastAction ?? current.lastAction ?? null,
        patch.lastFile ?? current.lastFile ?? null,
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
      name: row.name,
      role: row.role,
      status: row.status,
      ...(row.task ? { task: row.task } : {}),
      ...(row.model_category ? { modelCategory: row.model_category } : {}),
      ...(row.color ? { color: row.color } : {}),
      ...(row.last_action ? { lastAction: row.last_action } : {}),
      ...(row.last_file ? { lastFile: row.last_file } : {}),
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
    const id = input.id ?? randomUUID();
    const progress = Math.max(0, Math.min(100, input.progress ?? 0));
    this.db
      .prepare(
        'INSERT INTO tasks (id,title,status,agent_id,progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(id, input.title, input.status ?? 'pending', input.agentId ?? null, progress, now, now);
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
      title: row.title,
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
    const result = this.db
      .prepare('INSERT INTO events (type,message,metadata,created_at) VALUES (?,?,?,?)')
      .run(type, message, metadata ? JSON.stringify(metadata) : null, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      type,
      message,
      ...(metadata ? { metadata } : {}),
      createdAt,
    };
  }

  timeline(limit = 50): TimelineEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?')
      .all(Math.max(1, Math.min(500, limit))) as unknown as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      ...(row.metadata ? { metadata: JSON.parse(row.metadata) as Record<string, unknown> } : {}),
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
          type: row.type,
          message: row.message,
          ...(row.metadata
            ? { metadata: JSON.parse(row.metadata) as Record<string, unknown> }
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
