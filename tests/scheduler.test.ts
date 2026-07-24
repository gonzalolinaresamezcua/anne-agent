import { describe, expect, it } from "vitest";
import { runScheduler } from "../src/core/scheduler.js";
import type { DagNode } from "../src/core/types.js";

function makeNodes(): DagNode[] {
  const now = new Date().toISOString();
  const base = {
    encargoId: "e1",
    description: "",
    role: "worker",
    acceptance: "",
    model: null,
    agentId: null,
    runId: null,
    result: null,
    error: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  return [
    { ...base, id: "1", nodeKey: "n1", title: "one", dependsOn: [], status: "pending" },
    { ...base, id: "2", nodeKey: "n2", title: "two", dependsOn: ["n1"], status: "pending" },
    { ...base, id: "3", nodeKey: "n3", title: "three", dependsOn: ["n1"], status: "pending" },
  ];
}

describe("runScheduler", () => {
  it("ejecuta en orden de deps y paraleliza hijos", async () => {
    const nodes = makeNodes();
    const started: string[] = [];
    const order: string[] = [];

    const result = await runScheduler(
      {
        getNodes: () => nodes,
        onStatusChange: (nodeKey, status, extra) => {
          const n = nodes.find((x) => x.nodeKey === nodeKey)!;
          n.status = status;
          if (extra?.result !== undefined) n.result = extra.result ?? null;
          if (extra?.attempts !== undefined) n.attempts = extra.attempts;
        },
        runNode: async (node) => {
          started.push(node.nodeKey);
          await new Promise((r) => setTimeout(r, node.nodeKey === "n1" ? 30 : 10));
          order.push(node.nodeKey);
          return { result: `ok-${node.nodeKey}` };
        },
      },
      3,
    );

    expect(result.completed).toBe(true);
    expect(result.failed).toBe(false);
    expect(order[0]).toBe("n1");
    expect(new Set(order.slice(1))).toEqual(new Set(["n2", "n3"]));
    expect(nodes.every((n) => n.status === "done")).toBe(true);
  });

  it("propaga fallo y salta dependientes", async () => {
    const nodes = makeNodes();
    const result = await runScheduler(
      {
        getNodes: () => nodes,
        onStatusChange: (nodeKey, status) => {
          const n = nodes.find((x) => x.nodeKey === nodeKey)!;
          n.status = status;
        },
        runNode: async (node) => {
          if (node.nodeKey === "n1") throw new Error("boom");
          return { result: "ok" };
        },
      },
      2,
    );

    expect(result.failed).toBe(true);
    expect(nodes.find((n) => n.nodeKey === "n1")?.status).toBe("failed");
    expect(nodes.find((n) => n.nodeKey === "n2")?.status).toBe("skipped");
    expect(nodes.find((n) => n.nodeKey === "n3")?.status).toBe("skipped");
  });
});
