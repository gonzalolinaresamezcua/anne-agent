import { Cursor, type ModelListItem, type ModelSelection } from "@cursor/sdk";

export type ModelRole = "planner" | "worker" | "verifier" | "default";

export interface ModelPreferences {
  defaultModel: string;
  plannerModel?: string;
  workerModel?: string;
  verifierModel?: string;
}

let cachedModels: ModelListItem[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function listModels(apiKey: string, force = false): Promise<ModelListItem[]> {
  const now = Date.now();
  if (!force && cachedModels && now - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }
  const models = await Cursor.models.list({ apiKey });
  cachedModels = models;
  cachedAt = now;
  return models;
}

export function clearModelCache(): void {
  cachedModels = null;
  cachedAt = 0;
}

/**
 * Resuelve una selección de modelo contra el catálogo.
 * Fallback: { id: "auto" }.
 */
export function resolveModelSelection(
  models: ModelListItem[],
  preferredId: string | undefined,
  opts?: { preferFast?: boolean },
): ModelSelection {
  if (!preferredId || preferredId === "auto" || preferredId === "default") {
    return { id: "auto" };
  }

  const found =
    models.find((m) => m.id === preferredId) ??
    models.find((m) => m.aliases?.includes(preferredId)) ??
    models.find((m) => m.displayName.toLowerCase() === preferredId.toLowerCase());

  if (!found) {
    return { id: "auto" };
  }

  const params = pickParams(found, opts?.preferFast ?? false);
  return params ? { id: found.id, params } : { id: found.id };
}

function pickParams(
  model: ModelListItem,
  preferFast: boolean,
): ModelSelection["params"] | undefined {
  if (preferFast) {
    const fastParam = model.parameters?.find((p) => p.id === "fast");
    const trueVal = fastParam?.values.find((v) => v.value === "true");
    if (trueVal) {
      return [{ id: "fast", value: "true" }];
    }
    const fastVariant = model.variants?.find(
      (v) =>
        v.displayName.toLowerCase().includes("fast") ||
        v.params.some((p) => p.id === "fast" && p.value === "true"),
    );
    if (fastVariant?.params.length) {
      return fastVariant.params;
    }
  }

  const defaultVariant = model.variants?.find((v) => v.isDefault) ?? model.variants?.[0];
  if (defaultVariant?.params.length) {
    return defaultVariant.params;
  }
  return undefined;
}

export async function selectionForRole(
  apiKey: string,
  role: ModelRole,
  prefs: ModelPreferences,
  nodeOverride?: string | null,
): Promise<ModelSelection> {
  const models = await listModels(apiKey);
  const preferred =
    nodeOverride ||
    (role === "planner"
      ? prefs.plannerModel ?? prefs.defaultModel
      : role === "verifier"
        ? prefs.verifierModel ?? prefs.plannerModel ?? prefs.defaultModel
        : role === "worker"
          ? prefs.workerModel ?? prefs.defaultModel
          : prefs.defaultModel);

  return resolveModelSelection(models, preferred, {
    preferFast: role === "worker",
  });
}

export function formatModelList(models: ModelListItem[]): string {
  return models
    .map((m) => {
      const variants = m.variants?.length
        ? ` [${m.variants.map((v) => v.displayName).join(", ")}]`
        : "";
      return `- ${m.id} — ${m.displayName}${variants}`;
    })
    .join("\n");
}
