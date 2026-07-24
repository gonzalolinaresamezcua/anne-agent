import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ensureAnneHome, type AnnePaths } from "./store/paths.js";

export const AnneConfigSchema = z.object({
  apiKeyEnv: z.string().default("CURSOR_API_KEY"),
  defaultModel: z.string().default("auto"),
  plannerModel: z.string().optional(),
  workerModel: z.string().optional(),
  verifierModel: z.string().optional(),
  cwd: z.string().optional(),
  maxParallel: z.number().int().min(1).max(16).default(3),
  maxVerifyRetries: z.number().int().min(0).max(5).default(1),
  approval: z.enum(["ask", "auto"]).default("auto"),
  stream: z.boolean().default(true),
});

export type AnneConfig = z.infer<typeof AnneConfigSchema>;

export interface LoadedConfig {
  paths: AnnePaths;
  config: AnneConfig;
}

export function loadConfig(homeOverride?: string): LoadedConfig {
  const paths = ensureAnneHome(homeOverride);
  let raw: unknown = {};
  if (existsSync(paths.config)) {
    raw = JSON.parse(readFileSync(paths.config, "utf8"));
  }
  const config = AnneConfigSchema.parse(raw);
  return { paths, config };
}

export function saveConfig(config: AnneConfig, homeOverride?: string): AnnePaths {
  const paths = ensureAnneHome(homeOverride);
  writeFileSync(paths.config, JSON.stringify(config, null, 2) + "\n", "utf8");
  return paths;
}

export function resolveApiKey(config: AnneConfig, explicit?: string): string {
  const key = explicit ?? process.env[config.apiKeyEnv] ?? process.env.CURSOR_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      `Falta API key. Exporta ${config.apiKeyEnv} (o CURSOR_API_KEY) antes de usar anne.`,
    );
  }
  return key.trim();
}

export function resolveCwd(config: AnneConfig, override?: string): string {
  return override ?? config.cwd ?? process.cwd();
}
