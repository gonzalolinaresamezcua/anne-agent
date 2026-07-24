import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  DagNode,
  Encargo,
  EncargoStatus,
  NodeStatus,
  Phase,
  PlanNode,
} from "../core/types.js";
import { ensureAnneHome } from "./paths.js";

export class AnneStore {
  readonly db: Database.Database;

  constructor(dbPath?: string, homeOverride?: string) {
    const paths = ensureAnneHome(homeOverride);
    this.db = new Database(dbPath ?? paths.db);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encargos (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        summary TEXT,
        plan_json TEXT,
        verify_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        encargo_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        depends_on_json TEXT NOT NULL DEFAULT '[]',
        role TEXT NOT NULL DEFAULT 'worker',
        acceptance TEXT NOT NULL DEFAULT '',
        model TEXT,
        status TEXT NOT NULL,
        agent_id TEXT,
        run_id TEXT,
        result TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(encargo_id, node_key),
        FOREIGN KEY(encargo_id) REFERENCES encargos(id)
      );

      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encargo_id TEXT NOT NULL,
        node_key TEXT,
        phase TEXT,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        meta_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(encargo_id) REFERENCES encargos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_encargo ON nodes(encargo_id);
      CREATE INDEX IF NOT EXISTS idx_audit_encargo ON audit(encargo_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  createEncargo(goal: string, cwd: string): Encargo {
    const now = new Date().toISOString();
    const encargo: Encargo = {
      id: randomUUID(),
      goal,
      cwd,
      status: "created",
      phase: "describe",
      summary: null,
      planJson: null,
      verifyJson: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO encargos (id, goal, cwd, status, phase, summary, plan_json, verify_json, created_at, updated_at)
         VALUES (@id, @goal, @cwd, @status, @phase, @summary, @planJson, @verifyJson, @createdAt, @updatedAt)`,
      )
      .run(encargo);
    this.audit(encargo.id, "lifecycle", "Encargo creado", { phase: "describe" });
    return encargo;
  }

  getEncargo(id: string): Encargo | undefined {
    const row = this.db.prepare(`SELECT * FROM encargos WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapEncargo(row) : undefined;
  }

  latestEncargo(): Encargo | undefined {
    const row = this.db
      .prepare(`SELECT * FROM encargos ORDER BY created_at DESC LIMIT 1`)
      .get() as Record<string, unknown> | undefined;
    return row ? mapEncargo(row) : undefined;
  }

  listEncargos(limit = 20): Encargo[] {
    const rows = this.db
      .prepare(`SELECT * FROM encargos ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapEncargo);
  }

  updateEncargo(
    id: string,
    patch: Partial<{
      status: EncargoStatus;
      phase: Phase;
      summary: string | null;
      planJson: string | null;
      verifyJson: string | null;
    }>,
  ): Encargo {
    const current = this.getEncargo(id);
    if (!current) throw new Error(`Encargo no encontrado: ${id}`);
    const updated: Encargo = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE encargos SET status=@status, phase=@phase, summary=@summary,
         plan_json=@planJson, verify_json=@verifyJson, updated_at=@updatedAt WHERE id=@id`,
      )
      .run(updated);
    return updated;
  }

  replaceNodes(encargoId: string, planNodes: PlanNode[]): DagNode[] {
    this.db.prepare(`DELETE FROM nodes WHERE encargo_id = ?`).run(encargoId);
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO nodes (
        id, encargo_id, node_key, title, description, depends_on_json, role, acceptance,
        model, status, agent_id, run_id, result, error, attempts, created_at, updated_at
      ) VALUES (
        @id, @encargoId, @nodeKey, @title, @description, @dependsOnJson, @role, @acceptance,
        @model, @status, @agentId, @runId, @result, @error, @attempts, @createdAt, @updatedAt
      )`,
    );
    const nodes: DagNode[] = [];
    const tx = this.db.transaction(() => {
      for (const n of planNodes) {
        const node: DagNode = {
          id: randomUUID(),
          encargoId,
          nodeKey: n.id,
          title: n.title,
          description: n.description ?? "",
          dependsOn: n.dependsOn ?? [],
          role: n.role ?? "worker",
          acceptance: n.acceptance ?? "",
          model: n.model ?? null,
          status: "pending",
          agentId: null,
          runId: null,
          result: null,
          error: null,
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        };
        insert.run({
          id: node.id,
          encargoId: node.encargoId,
          nodeKey: node.nodeKey,
          title: node.title,
          description: node.description,
          dependsOnJson: JSON.stringify(node.dependsOn),
          role: node.role,
          acceptance: node.acceptance,
          model: node.model,
          status: node.status,
          agentId: node.agentId,
          runId: node.runId,
          result: node.result,
          error: node.error,
          attempts: node.attempts,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        });
        nodes.push(node);
      }
    });
    tx();
    return nodes;
  }

  listNodes(encargoId: string): DagNode[] {
    const rows = this.db
      .prepare(`SELECT * FROM nodes WHERE encargo_id = ? ORDER BY created_at ASC`)
      .all(encargoId) as Record<string, unknown>[];
    return rows.map(mapNode);
  }

  getNode(encargoId: string, nodeKey: string): DagNode | undefined {
    const row = this.db
      .prepare(`SELECT * FROM nodes WHERE encargo_id = ? AND node_key = ?`)
      .get(encargoId, nodeKey) as Record<string, unknown> | undefined;
    return row ? mapNode(row) : undefined;
  }

  updateNode(
    encargoId: string,
    nodeKey: string,
    patch: Partial<{
      status: NodeStatus;
      agentId: string | null;
      runId: string | null;
      result: string | null;
      error: string | null;
      attempts: number;
    }>,
  ): DagNode {
    const current = this.getNode(encargoId, nodeKey);
    if (!current) throw new Error(`Nodo no encontrado: ${nodeKey}`);
    const updated: DagNode = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE nodes SET status=@status, agent_id=@agentId, run_id=@runId, result=@result,
         error=@error, attempts=@attempts, updated_at=@updatedAt
         WHERE encargo_id=@encargoId AND node_key=@nodeKey`,
      )
      .run({
        status: updated.status,
        agentId: updated.agentId,
        runId: updated.runId,
        result: updated.result,
        error: updated.error,
        attempts: updated.attempts,
        updatedAt: updated.updatedAt,
        encargoId,
        nodeKey,
      });
    return updated;
  }

  audit(
    encargoId: string,
    category: string,
    message: string,
    opts?: { nodeKey?: string; phase?: Phase; meta?: unknown },
  ): void {
    this.db
      .prepare(
        `INSERT INTO audit (encargo_id, node_key, phase, category, message, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        encargoId,
        opts?.nodeKey ?? null,
        opts?.phase ?? null,
        category,
        message,
        opts?.meta !== undefined ? JSON.stringify(opts.meta) : null,
        new Date().toISOString(),
      );
  }

  listAudit(encargoId: string, limit = 50): AuditEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM audit WHERE encargo_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(encargoId, limit) as Record<string, unknown>[];
    return rows.map(mapAudit).reverse();
  }
}

function mapEncargo(row: Record<string, unknown>): Encargo {
  return {
    id: String(row.id),
    goal: String(row.goal),
    cwd: String(row.cwd),
    status: row.status as EncargoStatus,
    phase: row.phase as Phase,
    summary: (row.summary as string | null) ?? null,
    planJson: (row.plan_json as string | null) ?? null,
    verifyJson: (row.verify_json as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapNode(row: Record<string, unknown>): DagNode {
  return {
    id: String(row.id),
    encargoId: String(row.encargo_id),
    nodeKey: String(row.node_key),
    title: String(row.title),
    description: String(row.description ?? ""),
    dependsOn: JSON.parse(String(row.depends_on_json ?? "[]")) as string[],
    role: String(row.role ?? "worker"),
    acceptance: String(row.acceptance ?? ""),
    model: (row.model as string | null) ?? null,
    status: row.status as NodeStatus,
    agentId: (row.agent_id as string | null) ?? null,
    runId: (row.run_id as string | null) ?? null,
    result: (row.result as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    id: Number(row.id),
    encargoId: String(row.encargo_id),
    nodeKey: (row.node_key as string | null) ?? null,
    phase: (row.phase as Phase | null) ?? null,
    category: String(row.category),
    message: String(row.message),
    metaJson: (row.meta_json as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}
