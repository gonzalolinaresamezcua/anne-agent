import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnePaths } from "../store/paths.js";
import { ensureAnneHome } from "../store/paths.js";

export interface Skill {
  name: string;
  description: string;
  path: string;
  content: string;
}

function bundledSkillsRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/skills -> ../../skills ; dist/skills -> ../../skills
  const candidates = [
    join(here, "../../skills"),
    join(here, "../../../skills"),
    join(process.cwd(), "skills"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
  if (!raw.startsWith("---")) {
    return { body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { body: raw };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, "");
  let name: string | undefined;
  let description: string | undefined;
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2]?.replace(/^["']|["']$/g, "").trim();
    if (key === "name") name = val;
    if (key === "description") description = val;
  }
  return { name, description, body };
}

function loadSkillDir(dir: string): Skill | null {
  const skillFile = join(dir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const raw = readFileSync(skillFile, "utf8");
  const parsed = parseFrontmatter(raw);
  const fallbackName = dir.split(/[/\\]/).filter(Boolean).pop() ?? "skill";
  return {
    name: parsed.name ?? fallbackName,
    description: parsed.description ?? "",
    path: skillFile,
    content: parsed.body.trim() ? raw : raw,
  };
}

function loadSkillsFromRoot(root: string): Skill[] {
  if (!existsSync(root)) return [];
  const out: Skill[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (!statSync(full).isDirectory()) continue;
    const skill = loadSkillDir(full);
    if (skill) out.push(skill);
  }
  return out;
}

export function listSkills(paths?: AnnePaths): Skill[] {
  const p = paths ?? ensureAnneHome();
  const bundled = loadSkillsFromRoot(bundledSkillsRoot());
  const user = loadSkillsFromRoot(p.skillsDir);
  const map = new Map<string, Skill>();
  for (const s of bundled) map.set(s.name, s);
  for (const s of user) map.set(s.name, s); // user overrides
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkill(name: string, paths?: AnnePaths): Skill | undefined {
  return listSkills(paths).find((s) => s.name === name);
}

export function skillPromptBlock(name: string, paths?: AnnePaths): string {
  const skill = getSkill(name, paths);
  if (!skill) return "";
  return `# Skill: ${skill.name}\n${skill.description ? skill.description + "\n\n" : ""}${skill.content}`;
}
