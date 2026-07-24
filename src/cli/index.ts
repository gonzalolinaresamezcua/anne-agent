#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  resolveApiKey,
  resolveCwd,
  saveConfig,
  type AnneConfig,
} from "../config.js";
import { Orchestrator } from "../core/orchestrator.js";
import { renderAsciiGraph } from "../core/dag.js";
import { formatModelList, listModels } from "../cursor/models.js";
import { readMemory, writeUserPrefs } from "../memory/index.js";
import { listSkills } from "../skills/loader.js";
import { AnneStore } from "../store/db.js";
import { ensureAnneHome } from "../store/paths.js";

const VERSION = "0.1.0";

function printBanner(): void {
  console.log(
    chalk.bold.cyan("anne") +
      chalk.dim(` v${VERSION}`) +
      " — orquestación AITarea + Cursor SDK",
  );
}

function openStore(): AnneStore {
  return new AnneStore();
}

async function cmdRun(goal: string, opts: { cwd?: string }): Promise<number> {
  const { paths, config } = loadConfig();
  const cwd = resolveCwd(config, opts.cwd);
  // validate key early
  resolveApiKey(config);

  const store = openStore();
  try {
    printBanner();
    console.log(chalk.dim(`cwd: ${cwd}`));
    console.log(chalk.bold("\n▶ Encargo:") + ` ${goal}\n`);

    const orch = new Orchestrator({
      store,
      paths,
      config,
      cwd,
      onStream: (line) => {
        process.stdout.write(chalk.gray(line.endsWith("\n") ? line : line + "\n"));
      },
    });

    const result = await orch.run(goal);
    console.log("\n" + chalk.bold("Grafo final"));
    console.log(result.graph);
    console.log("\n" + chalk.bold("Resumen"));
    console.log(result.summary);
    console.log(
      chalk.dim(
        `\nencargo=${result.encargo.id} status=${result.encargo.status}`,
      ),
    );
    return result.ok ? 0 : 2;
  } finally {
    store.close();
  }
}

function cmdStatus(encargoId?: string): number {
  const store = openStore();
  try {
    const encargo = encargoId
      ? store.getEncargo(encargoId)
      : store.latestEncargo();
    if (!encargo) {
      console.error("No hay encargos.");
      return 1;
    }
    console.log(chalk.bold("Encargo") + ` ${encargo.id}`);
    console.log(`status: ${encargo.status}  phase: ${encargo.phase}`);
    console.log(`cwd: ${encargo.cwd}`);
    console.log(`goal: ${encargo.goal}`);
    if (encargo.summary) console.log(`summary: ${encargo.summary}`);
    console.log("\n" + renderAsciiGraph(store.listNodes(encargo.id)));
    return 0;
  } finally {
    store.close();
  }
}

function cmdGraph(encargoId?: string): number {
  return cmdStatus(encargoId);
}

function cmdAudit(encargoId?: string, limit = 50): number {
  const store = openStore();
  try {
    const encargo = encargoId
      ? store.getEncargo(encargoId)
      : store.latestEncargo();
    if (!encargo) {
      console.error("No hay encargos.");
      return 1;
    }
    const events = store.listAudit(encargo.id, limit);
    console.log(chalk.bold(`Auditoría`) + ` ${encargo.id}`);
    for (const e of events) {
      const node = e.nodeKey ? chalk.cyan(e.nodeKey) + " " : "";
      console.log(
        `${chalk.dim(e.createdAt)} ${chalk.yellow(e.category)} ${node}${e.message}`,
      );
    }
    return 0;
  } finally {
    store.close();
  }
}

async function cmdModels(): Promise<number> {
  const { config } = loadConfig();
  const apiKey = resolveApiKey(config);
  const models = await listModels(apiKey, true);
  console.log(chalk.bold("Modelos Cursor disponibles"));
  console.log(formatModelList(models));
  console.log(chalk.dim(`\ndefault configurado: ${config.defaultModel}`));
  return 0;
}

function cmdModel(id?: string): number {
  const loaded = loadConfig();
  if (!id) {
    console.log(`defaultModel=${loaded.config.defaultModel}`);
    console.log(`plannerModel=${loaded.config.plannerModel ?? "(default)"}`);
    console.log(`workerModel=${loaded.config.workerModel ?? "(default)"}`);
    console.log(`verifierModel=${loaded.config.verifierModel ?? "(default)"}`);
    return 0;
  }
  const next: AnneConfig = { ...loaded.config, defaultModel: id };
  saveConfig(next);
  console.log(`defaultModel → ${id}`);
  return 0;
}

function cmdSkills(): number {
  const { paths } = loadConfig();
  const skills = listSkills(paths);
  console.log(chalk.bold("Skills"));
  for (const s of skills) {
    console.log(`- ${s.name}${s.description ? ` — ${s.description}` : ""}`);
  }
  return 0;
}

function cmdMemory(writeUser?: string): number {
  const { paths } = loadConfig();
  if (writeUser !== undefined) {
    writeUserPrefs(writeUser, paths);
    console.log("USER.md actualizado");
    return 0;
  }
  const mem = readMemory(paths);
  console.log(chalk.bold("MEMORY.md"));
  console.log(mem.memory);
  console.log(chalk.bold("\nUSER.md"));
  console.log(mem.user);
  return 0;
}

function cmdList(): number {
  const store = openStore();
  try {
    const items = store.listEncargos(30);
    if (!items.length) {
      console.log("Sin encargos.");
      return 0;
    }
    for (const e of items) {
      console.log(
        `${e.id.slice(0, 8)}  ${e.status.padEnd(10)}  ${e.goal.slice(0, 70)}`,
      );
    }
    return 0;
  } finally {
    store.close();
  }
}

async function runRepl(): Promise<number> {
  ensureAnneHome();
  printBanner();
  console.log(
    chalk.dim(
      "Escribe un encargo, o /help. Ctrl+C para salir.\n",
    ),
  );

  const rl = createInterface({ input, output, terminal: true });
  let abort: AbortController | null = null;

  const handleSlash = async (line: string): Promise<boolean> => {
    const [cmd, ...rest] = line.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "help":
        console.log(`Comandos:
  /help          esta ayuda
  /new           limpia contexto visual
  /stop          cancela encargo en curso
  /status [id]   estado del encargo
  /graph [id]    grafo DAG
  /audit [id]    auditoría
  /models        catálogo Cursor
  /model [id]    ver/poner modelo default
  /skills        skills cargadas
  /memory        ver memoria
  /quit          salir`);
        return true;
      case "new":
        console.log(chalk.dim("Listo para un nuevo encargo."));
        return true;
      case "stop":
        abort?.abort();
        console.log(chalk.yellow("Señal de cancelación enviada."));
        return true;
      case "status":
        cmdStatus(arg || undefined);
        return true;
      case "graph":
        cmdGraph(arg || undefined);
        return true;
      case "audit":
        cmdAudit(arg || undefined);
        return true;
      case "models":
        await cmdModels();
        return true;
      case "model":
        cmdModel(arg || undefined);
        return true;
      case "skills":
        cmdSkills();
        return true;
      case "memory":
        cmdMemory();
        return true;
      case "quit":
      case "exit":
        rl.close();
        return true;
      default:
        console.log(`Comando desconocido: /${cmd}. Usa /help.`);
        return true;
    }
  };

  try {
    while (true) {
      let line: string;
      try {
        line = (await rl.question(chalk.cyan("anne> "))).trim();
      } catch {
        break;
      }
      if (!line) continue;
      if (line.startsWith("/")) {
        const cont = await handleSlash(line);
        if (!cont || line === "/quit" || line === "/exit") break;
        continue;
      }

      abort = new AbortController();
      const { paths, config } = loadConfig();
      const cwd = resolveCwd(config);
      const store = openStore();
      try {
        resolveApiKey(config);
        const orch = new Orchestrator({
          store,
          paths,
          config,
          cwd,
          signal: abort.signal,
          onStream: (l) => {
            process.stdout.write(chalk.gray(l.endsWith("\n") ? l : l + "\n"));
          },
        });
        const result = await orch.run(line);
        console.log("\n" + result.graph);
        console.log("\n" + result.summary);
        console.log(chalk.dim(`\nencargo=${result.encargo.id}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      } finally {
        store.close();
        abort = null;
      }
    }
  } finally {
    rl.close();
  }
  return 0;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("anne")
    .description("Anne Agent — CLI Linux con orquestación AITarea + Cursor SDK")
    .version(VERSION);

  program
    .command("run")
    .description("Ejecuta un encargo (pipeline completo)")
    .argument("<goal...>", "Objetivo en lenguaje natural")
    .option("--cwd <path>", "Workspace de trabajo")
    .action(async (goalParts: string[], opts: { cwd?: string }) => {
      const code = await cmdRun(goalParts.join(" "), opts);
      process.exitCode = code;
    });

  program
    .command("status")
    .description("Estado del último encargo o de un id")
    .argument("[encargoId]", "Id de encargo")
    .action((encargoId?: string) => {
      process.exitCode = cmdStatus(encargoId);
    });

  program
    .command("graph")
    .description("Grafo DAG ASCII")
    .argument("[encargoId]", "Id de encargo")
    .action((encargoId?: string) => {
      process.exitCode = cmdGraph(encargoId);
    });

  program
    .command("audit")
    .description("Auditoría del encargo")
    .argument("[encargoId]", "Id de encargo")
    .option("-n, --limit <n>", "Máximo de eventos", "50")
    .action((encargoId: string | undefined, opts: { limit: string }) => {
      process.exitCode = cmdAudit(encargoId, Number(opts.limit) || 50);
    });

  program
    .command("models")
    .description("Lista modelos del Cursor SDK")
    .action(async () => {
      process.exitCode = await cmdModels();
    });

  program
    .command("model")
    .description("Ver o fijar modelo default")
    .argument("[id]", "Model id (p.ej. auto, composer-2)")
    .action((id?: string) => {
      process.exitCode = cmdModel(id);
    });

  program
    .command("skills")
    .description("Lista skills cargadas")
    .action(() => {
      process.exitCode = cmdSkills();
    });

  program
    .command("memory")
    .description("Muestra MEMORY.md y USER.md")
    .option("--user <text>", "Sobrescribe USER.md")
    .action((opts: { user?: string }) => {
      process.exitCode = cmdMemory(opts.user);
    });

  program
    .command("list")
    .description("Lista encargos recientes")
    .action(() => {
      process.exitCode = cmdList();
    });

  program
    .command("init")
    .description("Inicializa ~/.anne")
    .action(() => {
      const paths = ensureAnneHome();
      const { config } = loadConfig();
      saveConfig(config);
      console.log(`Anne home listo en ${paths.home}`);
    });

  // default: REPL if no args
  if (process.argv.length <= 2) {
    process.exitCode = await runRepl();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
