# Anne Agent

**Un solo encargo en lenguaje natural → un DAG de agentes Cursor que trabajan en paralelo.**

CLI multiagente **open-source y gratis (MIT)** que orquesta tareas al estilo [AITarea](https://aitarea.com) usando **exclusivamente el [Cursor SDK](https://cursor.com/docs/sdk/typescript)** como cerebro. Sin wrappers de otros LLMs: planifica, ejecuta, verifica y audita con agentes Cursor locales.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.13-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cursor SDK](https://img.shields.io/badge/Cursor%20SDK-exclusivo-000000)](https://cursor.com/docs/sdk/typescript)
[![GitHub stars](https://img.shields.io/github/stars/gonzalolinaresamezcua/anne-agent?style=social)](https://github.com/gonzalolinaresamezcua/anne-agent)
[![Platform](https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black)](https://github.com/gonzalolinaresamezcua/anne-agent)

```bash
anne run "Crea un CLI hello-world en TypeScript en ./demo y añade tests"
```

<p align="center">
  <img src="./docs/demo.svg" alt="Demo de Anne Agent: encargo → DAG → ejecución en paralelo" width="880" />
</p>

> 💡 **¿Tienes un GIF/vídeo real de terminal?** Sustituye el SVG de arriba por `./docs/demo.gif` — es lo que más convierte en GitHub.

---

## Por qué Anne

| Problema | Qué hace Anne |
|---|---|
| Un agente solo se atasca en encargos grandes | Descompone el objetivo en un **DAG** de subtareas |
| Ejecutar todo en serie es lento | Lanza **workers Cursor en paralelo** (ready-set) |
| No sabes qué pasó | Deja **auditoría** append-only en SQLite + grafo ASCII |
| Quieres el mismo cerebro que Cursor | Usa **solo** `@cursor/sdk` (local runtime) |

**100% gratis · MIT · Linux · TypeScript · Cursor SDK**

---

## Requisitos

- Linux
- Node.js ≥ 22.13
- `CURSOR_API_KEY` ([dashboard de Cloud Agents de Cursor](https://cursor.com/dashboard))

## Instalación

```bash
git clone https://github.com/gonzalolinaresamezcua/anne-agent.git
cd anne-agent
npm install
npm run build
npm link   # opcional: expone el binario `anne`
```

## Uso rápido

```bash
export CURSOR_API_KEY=cursor_...

anne init
anne models
anne run "Crea un CLI hello-world en TypeScript en ./demo y añade tests"
anne graph
anne audit
```

REPL interactivo:

```bash
anne
anne> /help
anne> Crea un README breve en ./notas
```

## Pipeline (fases AITarea)

```text
Describe → Analyze → Plan (DAG) → Execute (paralelo) → Verify → Deliver
```

1. **Describe** — objetivo del usuario
2. **Analyze** — clasificación y riesgos
3. **Plan** — DAG JSON (`nodes[]` con deps y acceptance)
4. **Execute** — workers Cursor en paralelo (ready-set)
5. **Verify** — QA; puede reabrir nodos fallidos
6. **Deliver** — resumen + memoria

## Conceptos

| Concepto | Significado |
|---|---|
| Encargo | Objetivo en lenguaje natural |
| Nodo | Subtarea del DAG |
| Skill | Procedimiento `SKILL.md` inyectado al prompt |
| Memoria | `~/.anne/memory/MEMORY.md` + `USER.md` |
| Auditoría | Log append-only en SQLite |

## Comandos

| Comando | Descripción |
|---|---|
| `anne` | REPL |
| `anne run "…"` | Pipeline completo |
| `anne status [id]` | Estado |
| `anne graph [id]` | DAG ASCII |
| `anne audit [id]` | Auditoría |
| `anne models` | Catálogo `Cursor.models.list()` |
| `anne model [id]` | Ver/fijar modelo default |
| `anne skills` | Skills cargadas |
| `anne memory` | Ver memoria |
| `anne list` | Encargos recientes |
| `anne init` | Crea `~/.anne` |

Slash en REPL: `/help`, `/stop`, `/new`, `/status`, `/graph`, `/audit`, `/models`, `/model`, `/skills`, `/memory`, `/quit`.

## Configuración

`~/.anne/config.json`:

```json
{
  "apiKeyEnv": "CURSOR_API_KEY",
  "defaultModel": "auto",
  "plannerModel": "auto",
  "workerModel": "auto",
  "verifierModel": "auto",
  "maxParallel": 3,
  "maxVerifyRetries": 1,
  "approval": "auto",
  "stream": true
}
```

Home override: `ANNE_HOME=/ruta`.

## Cerebro: solo Cursor SDK

Anne **no** envuelve OpenAI, Anthropic ni otros proveedores. El runtime es Cursor:

- Modelos vía `Cursor.models.list()` (sin hardcode frágil; fallback `auto`)
- Runtime `local: { cwd }`
- Roles: planner / worker / verifier con selección de modelo configurable
- Dispose garantizado; distingue errores de arranque vs run

Documentación del SDK: [cursor.com/docs/sdk/typescript](https://cursor.com/docs/sdk/typescript)

## Desarrollo

```bash
npm run anne -- models
npm test
npm run typecheck
```

## Roadmap / contribuir

Issues y PRs bienvenidos. Ideas útiles: más skills, exportación del DAG, demos, empaquetado npm.

Si Anne te sirve, **una ⭐ en GitHub** ayuda mucho a que más gente lo descubra.

## Licencia

[MIT](./LICENSE) — gratis para uso personal y comercial.

Hecho por [digitacode.es](https://digitacode.es)
