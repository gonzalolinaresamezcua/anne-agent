# Anne Agent

CLI Linux multiagente: orquestación estilo [AITarea](https://aitarea.com) con cerebro exclusivo del [Cursor SDK](https://cursor.com/docs/sdk/typescript).

Anne recibe un **encargo** en lenguaje natural, lo descompone en un **DAG** de subtareas, ejecuta nodos en paralelo con agentes Cursor locales, verifica la entrega y deja **auditoría** completa.

## Requisitos

- Linux
- Node.js ≥ 22.13
- `CURSOR_API_KEY` (dashboard de Cloud Agents de Cursor)

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
| `anne run "<encargo>"` | Pipeline completo |
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

- Modelos vía `Cursor.models.list()` (sin hardcode frágil; fallback `auto`)
- Runtime `local: { cwd }`
- Roles: planner / worker / verifier con selección de modelo configurable
- Dispose garantizado; distingue errores de arranque vs run

## Desarrollo

```bash
npm run anne -- models
npm test
npm run typecheck
```

## Licencia

MIT — digitacode.es
