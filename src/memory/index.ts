import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import type { AnnePaths } from "../store/paths.js";
import { ensureAnneHome } from "../store/paths.js";

export function readMemory(paths?: AnnePaths): { memory: string; user: string } {
  const p = paths ?? ensureAnneHome();
  return {
    memory: existsSync(p.memoryFile) ? readFileSync(p.memoryFile, "utf8") : "",
    user: existsSync(p.userFile) ? readFileSync(p.userFile, "utf8") : "",
  };
}

export function appendMemoryNote(note: string, paths?: AnnePaths): void {
  const p = paths ?? ensureAnneHome();
  const line = `\n- ${new Date().toISOString().slice(0, 10)}: ${note.trim()}\n`;
  appendFileSync(p.memoryFile, line, "utf8");
}

export function writeUserPrefs(content: string, paths?: AnnePaths): void {
  const p = paths ?? ensureAnneHome();
  writeFileSync(p.userFile, content.endsWith("\n") ? content : content + "\n", "utf8");
}

export function nudgeMemoryAfterDelivery(input: {
  goal: string;
  summary: string;
  paths?: AnnePaths;
}): void {
  const short = input.summary.replace(/\s+/g, " ").slice(0, 240);
  appendMemoryNote(`Encargo OK — ${input.goal.slice(0, 80)} → ${short}`, input.paths);
}
