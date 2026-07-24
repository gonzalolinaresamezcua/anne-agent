import { describe, expect, it } from "vitest";
import {
  computeReadyNodes,
  DagValidationError,
  isDagComplete,
  markBlockedForFailedDeps,
  renderAsciiGraph,
  validatePlanNodes,
} from "../src/core/dag.js";
import type { DagNode, PlanNode } from "../src/core/types.js";

function node(partial: Partial<DagNode> & { nodeKey: string }): DagNode {
  return {
    id: partial.id ?? partial.nodeKey,
    encargoId: "e1",
    nodeKey: partial.nodeKey,
    title: partial.title ?? partial.nodeKey,
    description: "",
    dependsOn: partial.dependsOn ?? [],
    role: "worker",
    acceptance: "",
    model: null,
    status: partial.status ?? "pending",
    agentId: null,
    runId: null,
    result: null,
    error: null,
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("validatePlanNodes", () => {
  it("acepta DAG válido", () => {
    const nodes: PlanNode[] = [
      { id: "n1", title: "a", description: "", dependsOn: [], role: "worker", acceptance: "" },
      { id: "n2", title: "b", description: "", dependsOn: ["n1"], role: "worker", acceptance: "" },
      { id: "n3", title: "c", description: "", dependsOn: ["n1"], role: "worker", acceptance: "" },
    ];
    expect(() => validatePlanNodes(nodes)).not.toThrow();
  });

  it("detecta ciclo", () => {
    const nodes: PlanNode[] = [
      { id: "n1", title: "a", description: "", dependsOn: ["n2"], role: "worker", acceptance: "" },
      { id: "n2", title: "b", description: "", dependsOn: ["n1"], role: "worker", acceptance: "" },
    ];
    expect(() => validatePlanNodes(nodes)).toThrow(DagValidationError);
  });

  it("detecta dependencia desconocida", () => {
    const nodes: PlanNode[] = [
      { id: "n1", title: "a", description: "", dependsOn: ["ghost"], role: "worker", acceptance: "" },
    ];
    expect(() => validatePlanNodes(nodes)).toThrow(/desconocido/);
  });
});

describe("computeReadyNodes", () => {
  it("marca raíces ready y respeta deps", () => {
    const nodes = [
      node({ nodeKey: "n1", status: "pending" }),
      node({ nodeKey: "n2", status: "pending", dependsOn: ["n1"] }),
      node({ nodeKey: "n3", status: "pending", dependsOn: ["n1"] }),
    ];
    const ready = computeReadyNodes(nodes).map((n) => n.nodeKey);
    expect(ready).toEqual(["n1"]);

    nodes[0]!.status = "done";
    const ready2 = computeReadyNodes(nodes).map((n) => n.nodeKey).sort();
    expect(ready2).toEqual(["n2", "n3"]);
  });
});

describe("markBlockedForFailedDeps", () => {
  it("salta nodos con deps fallidas", () => {
    const nodes = [
      node({ nodeKey: "n1", status: "failed" }),
      node({ nodeKey: "n2", status: "pending", dependsOn: ["n1"] }),
    ];
    const updates = markBlockedForFailedDeps(nodes);
    expect(updates).toEqual([{ nodeKey: "n2", status: "skipped" }]);
  });
});

describe("isDagComplete / render", () => {
  it("completa cuando todos terminales", () => {
    const nodes = [
      node({ nodeKey: "n1", status: "done" }),
      node({ nodeKey: "n2", status: "skipped" }),
    ];
    expect(isDagComplete(nodes)).toBe(true);
    expect(renderAsciiGraph(nodes)).toContain("n1");
  });
});
