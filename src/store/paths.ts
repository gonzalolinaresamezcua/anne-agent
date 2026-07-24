import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

export function getAnneHome(override?: string): string {
  return override ?? process.env.ANNE_HOME ?? join(homedir(), ".anne");
}

export interface AnnePaths {
  home: string;
  config: string;
  db: string;
  memoryDir: string;
  memoryFile: string;
  userFile: string;
  skillsDir: string;
  sessionsDir: string;
}

export function resolvePaths(homeOverride?: string): AnnePaths {
  const home = getAnneHome(homeOverride);
  const memoryDir = join(home, "memory");
  return {
    home,
    config: join(home, "config.json"),
    db: join(home, "anne.db"),
    memoryDir,
    memoryFile: join(memoryDir, "MEMORY.md"),
    userFile: join(memoryDir, "USER.md"),
    skillsDir: join(home, "skills"),
    sessionsDir: join(home, "sessions"),
  };
}

export function ensureAnneHome(homeOverride?: string): AnnePaths {
  const paths = resolvePaths(homeOverride);
  for (const dir of [paths.home, paths.memoryDir, paths.skillsDir, paths.sessionsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(paths.memoryFile)) {
    writeFileSync(
      paths.memoryFile,
      "# MEMORY\n\nHechos y lecciones aprendidas entre encargos.\n",
      "utf8",
    );
  }
  if (!existsSync(paths.userFile)) {
    writeFileSync(
      paths.userFile,
      "# USER\n\nPreferencias del usuario.\n",
      "utf8",
    );
  }
  return paths;
}
