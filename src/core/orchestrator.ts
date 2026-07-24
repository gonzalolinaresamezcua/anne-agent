import type { AnneConfig } from "../config.js";
import { resolveApiKey } from "../config.js";
import { runLocalAgent } from "../cursor/client.js";
import { selectionForRole } from "../cursor/models.js";
import {
  buildAnalyzePlanPrompt,
  buildVerifyPrompt,
  buildWorkerPrompt,
  extractJsonObject,
} from "../cursor/prompts.js";
import { nudgeMemoryAfterDelivery, readMemory } from "../memory/index.js";
import { skillPromptBlock } from "../skills/loader.js";
import type { AnneStore } from "../store/db.js";
import type { AnnePaths } from "../store/paths.js";
import {
  PlanResultSchema,
  VerifyResultSchema,
  type Encargo,
  type StreamHandler,
} from "./types.js";
import { dagFailed, renderAsciiGraph, validatePlanNodes } from "./dag.js";
import { runScheduler } from "./scheduler.js";

export interface OrchestratorOptions {
  store: AnneStore;
  paths: AnnePaths;
  config: AnneConfig;
  apiKey?: string;
  cwd: string;
  onStream?: StreamHandler;
  signal?: AbortSignal;
}

export interface OrchestratorResult {
  encargo: Encargo;
  graph: string;
  summary: string;
  ok: boolean;
}

export class Orchestrator {
  constructor(private readonly opts: OrchestratorOptions) {}

  private log(encargoId: string, category: string, message: string, extra?: {
    nodeKey?: string;
    phase?: Encargo["phase"];
    meta?: unknown;
  }): void {
    this.opts.store.audit(encargoId, category, message, extra);
    this.opts.onStream?.(message);
  }

  async run(goal: string): Promise<OrchestratorResult> {
    const { store, config, paths, cwd } = this.opts;
    const apiKey = resolveApiKey(config, this.opts.apiKey);
    const encargo = store.createEncargo(goal, cwd);
    this.log(encargo.id, "phase", `Fase describe → analyze`, { phase: "analyze" });

    try {
      // ANALYZE + PLAN
      store.updateEncargo(encargo.id, { status: "analyzing", phase: "analyze" });
      const mem = readMemory(paths);
      const planSkill = skillPromptBlock("plan-encargo", paths);
      const plannerModel = await selectionForRole(apiKey, "planner", config);
      this.log(encargo.id, "model", `Planner model: ${plannerModel.id}`, {
        phase: "plan",
        meta: plannerModel,
      });

      store.updateEncargo(encargo.id, { status: "planning", phase: "plan" });
      const planOutcome = await runLocalAgent({
        apiKey,
        cwd,
        model: plannerModel,
        label: "planner",
        stream: config.stream,
        onStream: this.opts.onStream,
        signal: this.opts.signal,
        prompt: buildAnalyzePlanPrompt({
          goal,
          cwd,
          memory: mem.memory,
          userPrefs: mem.user,
          skillText: planSkill,
        }),
      });

      if (!planOutcome.ok) {
        throw new Error(`Planner falló: ${planOutcome.error}`);
      }

      const planRaw = extractJsonObject(planOutcome.result);
      const plan = PlanResultSchema.parse(planRaw);
      validatePlanNodes(plan.nodes);
      store.replaceNodes(encargo.id, plan.nodes);
      store.updateEncargo(encargo.id, {
        planJson: JSON.stringify(plan),
        summary: plan.summary,
      });
      this.log(encargo.id, "plan", `Plan con ${plan.nodes.length} nodos`, {
        phase: "plan",
        meta: { risks: plan.risks },
      });
      this.opts.onStream?.("\n" + renderAsciiGraph(store.listNodes(encargo.id)) + "\n");

      // EXECUTE
      store.updateEncargo(encargo.id, { status: "executing", phase: "execute" });
      this.log(encargo.id, "phase", "Fase execute", { phase: "execute" });
      await this.executeNodes(encargo.id, apiKey);

      let nodes = store.listNodes(encargo.id);
      if (dagFailed(nodes)) {
        store.updateEncargo(encargo.id, { status: "failed", phase: "execute" });
        const failed = nodes.filter((n) => n.status === "failed");
        throw new Error(
          `Ejecución fallida en nodos: ${failed.map((n) => n.nodeKey).join(", ")}`,
        );
      }

      // VERIFY (+ optional reopen)
      let verifyPassed = false;
      let verifySummary = "";
      for (let attempt = 0; attempt <= config.maxVerifyRetries; attempt++) {
        store.updateEncargo(encargo.id, { status: "verifying", phase: "verify" });
        this.log(encargo.id, "phase", `Fase verify (intento ${attempt + 1})`, {
          phase: "verify",
        });

        const verify = await this.verify(encargo.id, apiKey, goal, cwd);
        store.updateEncargo(encargo.id, { verifyJson: JSON.stringify(verify) });
        verifyPassed = verify.passed;
        verifySummary = verify.summary;

        if (verify.passed) break;

        if (attempt < config.maxVerifyRetries && verify.failedNodeIds.length > 0) {
          this.log(
            encargo.id,
            "verify",
            `Reabriendo nodos: ${verify.failedNodeIds.join(", ")}`,
            { phase: "verify" },
          );
          for (const nodeKey of verify.failedNodeIds) {
            const node = store.getNode(encargo.id, nodeKey);
            if (node) {
              store.updateNode(encargo.id, nodeKey, {
                status: "pending",
                error: null,
                result: null,
              });
            }
          }
          store.updateEncargo(encargo.id, { status: "executing", phase: "execute" });
          await this.executeNodes(encargo.id, apiKey);
          nodes = store.listNodes(encargo.id);
          if (dagFailed(nodes)) break;
        } else {
          break;
        }
      }

      // DELIVER
      store.updateEncargo(encargo.id, { phase: "deliver" });
      const final = store.listNodes(encargo.id);
      const graph = renderAsciiGraph(final);
      const summary = [
        verifyPassed ? "Entrega OK" : "Entrega con observaciones",
        plan.summary,
        verifySummary,
        `Nodos: ${final.filter((n) => n.status === "done").length}/${final.length} done`,
      ]
        .filter(Boolean)
        .join("\n");

      if (verifyPassed) {
        store.updateEncargo(encargo.id, { status: "delivered", summary });
        nudgeMemoryAfterDelivery({ goal, summary: verifySummary || plan.summary, paths });
        this.log(encargo.id, "deliver", "Encargo entregado", { phase: "deliver" });
      } else {
        store.updateEncargo(encargo.id, { status: "failed", summary });
        this.log(encargo.id, "deliver", "Verificación no superada", { phase: "deliver" });
      }

      return {
        encargo: store.getEncargo(encargo.id)!,
        graph,
        summary,
        ok: verifyPassed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.updateEncargo(encargo.id, { status: "failed", summary: message });
      this.log(encargo.id, "error", message);
      return {
        encargo: store.getEncargo(encargo.id)!,
        graph: renderAsciiGraph(store.listNodes(encargo.id)),
        summary: message,
        ok: false,
      };
    }
  }

  private async executeNodes(encargoId: string, apiKey: string): Promise<void> {
    const { store, config, paths, cwd } = this.opts;
    const encargo = store.getEncargo(encargoId)!;
    const workerSkill = skillPromptBlock("ejecutar-nodo", paths);

    await runScheduler(
      {
        getNodes: () => store.listNodes(encargoId),
        onLog: (m) => this.log(encargoId, "scheduler", m, { phase: "execute" }),
        onStatusChange: (nodeKey, status, extra) => {
          store.updateNode(encargoId, nodeKey, { status, ...extra });
          store.audit(encargoId, "node", `Nodo ${nodeKey} → ${status}`, {
            nodeKey,
            phase: "execute",
          });
        },
        runNode: async (node) => {
          const model = await selectionForRole(
            apiKey,
            "worker",
            config,
            node.model,
          );
          const depResults = node.dependsOn
            .map((d) => store.getNode(encargoId, d))
            .filter((n): n is NonNullable<typeof n> => Boolean(n))
            .map((n) => ({
              nodeKey: n.nodeKey,
              title: n.title,
              result: n.result ?? "",
            }));

          const outcome = await runLocalAgent({
            apiKey,
            cwd,
            model,
            label: node.nodeKey,
            stream: config.stream,
            onStream: this.opts.onStream,
            signal: this.opts.signal,
            prompt: buildWorkerPrompt({
              goal: encargo.goal,
              cwd,
              node,
              dependencyResults: depResults,
              skillText: workerSkill,
              approval: config.approval,
            }),
          });

          if (!outcome.ok) {
            throw new Error(outcome.error);
          }
          return {
            result: outcome.result,
            agentId: outcome.agentId,
            runId: outcome.runId,
          };
        },
      },
      config.maxParallel,
    );
  }

  private async verify(
    encargoId: string,
    apiKey: string,
    goal: string,
    cwd: string,
  ) {
    const { store, config, paths } = this.opts;
    const nodes = store.listNodes(encargoId);
    const model = await selectionForRole(apiKey, "verifier", config);
    const skillText = skillPromptBlock("verificar-entrega", paths);

    const outcome = await runLocalAgent({
      apiKey,
      cwd,
      model,
      label: "verifier",
      stream: config.stream,
      onStream: this.opts.onStream,
      signal: this.opts.signal,
      prompt: buildVerifyPrompt({
        goal,
        cwd,
        skillText,
        nodes: nodes.map((n) => ({
          nodeKey: n.nodeKey,
          title: n.title,
          acceptance: n.acceptance,
          status: n.status,
          result: n.result,
          error: n.error,
        })),
      }),
    });

    if (!outcome.ok) {
      return VerifyResultSchema.parse({
        passed: false,
        summary: `Verifier falló: ${outcome.error}`,
        failedNodeIds: nodes.filter((n) => n.status !== "done").map((n) => n.nodeKey),
        artifacts: [],
      });
    }

    const raw = extractJsonObject(outcome.result);
    return VerifyResultSchema.parse(raw);
  }
}
