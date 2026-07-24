import {
  Agent,
  CursorAgentError,
  type ModelSelection,
  type RunResult,
  type SDKMessage,
} from "@cursor/sdk";
import type { StreamHandler } from "../core/types.js";

export interface RunAgentOptions {
  apiKey: string;
  cwd: string;
  model: ModelSelection;
  prompt: string;
  label?: string;
  stream?: boolean;
  onStream?: StreamHandler;
  signal?: AbortSignal;
}

export interface RunAgentSuccess {
  ok: true;
  result: string;
  agentId: string;
  runId: string;
  status: RunResult["status"];
  durationMs?: number;
  requestId?: string;
}

export interface RunAgentFailure {
  ok: false;
  error: string;
  agentId?: string;
  runId?: string;
  status?: RunResult["status"];
  retryable?: boolean;
  startupFailure: boolean;
}

export type RunAgentOutcome = RunAgentSuccess | RunAgentFailure;

function formatStreamEvent(event: SDKMessage, label?: string): string | null {
  const prefix = label ? `[${label}] ` : "";
  if (event.type === "assistant") {
    const text = event.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text.trim()) return null;
    return `${prefix}${text}`;
  }
  if (event.type === "tool_call") {
    return `${prefix}⚙ ${event.name} (${event.status})`;
  }
  if (event.type === "status" && event.message) {
    return `${prefix}status: ${event.status} — ${event.message}`;
  }
  return null;
}

/**
 * Ejecuta un agente Cursor local one-shot con dispose garantizado.
 */
export async function runLocalAgent(opts: RunAgentOptions): Promise<RunAgentOutcome> {
  const { apiKey, cwd, model, prompt, label, stream = true, onStream, signal } = opts;

  let agentId: string | undefined;
  let runId: string | undefined;

  try {
    await using agent = await Agent.create({
      apiKey,
      model,
      local: {
        cwd,
        settingSources: [],
      },
    });
    agentId = agent.agentId;

    if (signal?.aborted) {
      return {
        ok: false,
        error: "Cancelado antes de enviar",
        agentId,
        startupFailure: false,
        status: "cancelled",
      };
    }

    const run = await agent.send(prompt);
    runId = run.id;
    onStream?.(`${label ? `[${label}] ` : ""}agent=${agentId} run=${runId}`);

    if (stream && run.supports("stream")) {
      for await (const event of run.stream()) {
        if (signal?.aborted && run.supports("cancel")) {
          await run.cancel();
          break;
        }
        const line = formatStreamEvent(event, label);
        if (line) onStream?.(line);
      }
    }

    const result = await run.wait();
    if (result.status === "finished") {
      return {
        ok: true,
        result: result.result ?? "",
        agentId: agent.agentId,
        runId: result.id,
        status: result.status,
        durationMs: result.durationMs,
        requestId: result.requestId,
      };
    }

    return {
      ok: false,
      error: result.error?.message ?? `Run terminó con status=${result.status}`,
      agentId: agent.agentId,
      runId: result.id,
      status: result.status,
      startupFailure: false,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return {
        ok: false,
        error: err.message,
        agentId,
        runId,
        retryable: err.isRetryable,
        startupFailure: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      agentId,
      runId,
      startupFailure: false,
    };
  }
}
