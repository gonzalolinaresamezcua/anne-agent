import type { DagNode, NodeStatus, PlanNode } from "./types.js";

export class DagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DagValidationError";
  }
}

export function validatePlanNodes(nodes: PlanNode[]): void {
  if (nodes.length === 0) {
    throw new DagValidationError("El plan no contiene nodos");
  }
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new DagValidationError(`Nodo duplicado: ${n.id}`);
    }
    ids.add(n.id);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn ?? []) {
      if (!ids.has(dep)) {
        throw new DagValidationError(`Nodo ${n.id} depende de desconocido: ${dep}`);
      }
      if (dep === n.id) {
        throw new DagValidationError(`Nodo ${n.id} no puede depender de sí mismo`);
      }
    }
  }
  detectCycles(nodes);
}

function detectCycles(nodes: PlanNode[]): void {
  const graph = new Map(nodes.map((n) => [n.id, n.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new DagValidationError(`Ciclo detectado: ${[...stack, id].join(" → ")}`);
    }
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      visit(dep, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of graph.keys()) {
    visit(id, []);
  }
}

export function computeReadyNodes(nodes: DagNode[]): DagNode[] {
  const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
  const ready: DagNode[] = [];
  for (const node of nodes) {
    if (node.status !== "pending" && node.status !== "ready" && node.status !== "blocked") {
      continue;
    }
    const deps = node.dependsOn;
    const allDone = deps.every((d) => byKey.get(d)?.status === "done");
    const anyFailed = deps.some((d) => {
      const s = byKey.get(d)?.status;
      return s === "failed" || s === "skipped";
    });
    if (anyFailed) continue;
    if (allDone) ready.push(node);
  }
  return ready;
}

export function markBlockedForFailedDeps(nodes: DagNode[]): Array<{ nodeKey: string; status: NodeStatus }> {
  const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
  const updates: Array<{ nodeKey: string; status: NodeStatus }> = [];
  for (const node of nodes) {
    if (node.status === "done" || node.status === "failed" || node.status === "skipped" || node.status === "running") {
      continue;
    }
    const failedDep = node.dependsOn.some((d) => {
      const s = byKey.get(d)?.status;
      return s === "failed" || s === "skipped";
    });
    if (failedDep) {
      updates.push({ nodeKey: node.nodeKey, status: "skipped" });
    }
  }
  return updates;
}

export function isDagComplete(nodes: DagNode[]): boolean {
  return nodes.every(
    (n) => n.status === "done" || n.status === "failed" || n.status === "skipped",
  );
}

export function dagFailed(nodes: DagNode[]): boolean {
  return nodes.some((n) => n.status === "failed");
}

export function renderAsciiGraph(nodes: DagNode[]): string {
  if (nodes.length === 0) return "(sin nodos)";
  const lines: string[] = [];
  for (const n of nodes) {
    const deps = n.dependsOn.length ? ` ← [${n.dependsOn.join(", ")}]` : "";
    lines.push(`[${n.status.padEnd(8)}] ${n.nodeKey}: ${n.title}${deps}`);
  }
  return lines.join("\n");
}
