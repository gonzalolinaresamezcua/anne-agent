import type { DagNode } from "./types.js";
import { computeReadyNodes, isDagComplete, markBlockedForFailedDeps } from "./dag.js";

export interface SchedulerHooks {
  onStatusChange: (nodeKey: string, status: DagNode["status"], extra?: Partial<DagNode>) => void;
  runNode: (node: DagNode) => Promise<{ result: string; agentId?: string; runId?: string }>;
  getNodes: () => DagNode[];
  onLog?: (message: string) => void;
}

export interface SchedulerResult {
  nodes: DagNode[];
  completed: boolean;
  failed: boolean;
}

/**
 * Ejecuta nodos ready en paralelo hasta maxParallel, respetando dependencias del DAG.
 */
export async function runScheduler(
  hooks: SchedulerHooks,
  maxParallel: number,
): Promise<SchedulerResult> {
  const inFlight = new Map<string, Promise<void>>();

  const pump = async (): Promise<void> => {
    while (true) {
      let nodes = hooks.getNodes();
      for (const u of markBlockedForFailedDeps(nodes)) {
        hooks.onStatusChange(u.nodeKey, u.status);
      }
      nodes = hooks.getNodes();
      if (isDagComplete(nodes) && inFlight.size === 0) break;

      const ready = computeReadyNodes(nodes).filter((n) => !inFlight.has(n.nodeKey));
      const slots = Math.max(0, maxParallel - inFlight.size);

      if (slots === 0 || ready.length === 0) {
        if (inFlight.size === 0) {
          // Deadlock o todo bloqueado
          break;
        }
        await Promise.race(inFlight.values());
        continue;
      }

      for (const node of ready.slice(0, slots)) {
        const key = node.nodeKey;
        hooks.onStatusChange(key, "running", { attempts: node.attempts + 1 });
        hooks.onLog?.(`Nodo ${key} en ejecución`);

        const task = (async () => {
          try {
            const out = await hooks.runNode({ ...node, attempts: node.attempts + 1 });
            hooks.onStatusChange(key, "done", {
              result: out.result,
              agentId: out.agentId ?? null,
              runId: out.runId ?? null,
              error: null,
            });
            hooks.onLog?.(`Nodo ${key} completado`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            hooks.onStatusChange(key, "failed", { error: message });
            hooks.onLog?.(`Nodo ${key} falló: ${message}`);
          } finally {
            inFlight.delete(key);
          }
        })();

        inFlight.set(key, task);
      }
    }

    if (inFlight.size > 0) {
      await Promise.all(inFlight.values());
    }
  };

  await pump();
  const finalNodes = hooks.getNodes();
  return {
    nodes: finalNodes,
    completed: isDagComplete(finalNodes),
    failed: finalNodes.some((n) => n.status === "failed"),
  };
}
