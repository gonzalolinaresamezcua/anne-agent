import type { DagNode } from "../core/types.js";

export function buildAnalyzePlanPrompt(input: {
  goal: string;
  cwd: string;
  memory: string;
  userPrefs: string;
  skillText: string;
}): string {
  return `${input.skillText}

# Encargo
${input.goal}

# Workspace
cwd: ${input.cwd}

# Memoria
${input.memory || "(vacía)"}

# Preferencias de usuario
${input.userPrefs || "(ninguna)"}

# Tarea
Analiza el encargo y genera un plan DAG ejecutable.
Responde SOLO con un JSON válido (sin markdown) con esta forma:
{
  "summary": "resumen corto del enfoque",
  "risks": ["riesgo1"],
  "workspaceNotes": "notas del workspace",
  "nodes": [
    {
      "id": "n1",
      "title": "título corto",
      "description": "qué debe hacer el worker",
      "dependsOn": [],
      "role": "worker",
      "acceptance": "criterio verificable de done"
    }
  ]
}

Reglas:
- ids únicos y cortos (n1, n2, ...)
- dependsOn solo puede referenciar ids existentes
- sin ciclos
- paraleliza cuando no haya dependencia real
- cada nodo debe ser accionable en el cwd con herramientas de Cursor (archivos, terminal, tests)
- incluye nodos de implementación y, si aplica, tests
`;
}

export function buildWorkerPrompt(input: {
  goal: string;
  cwd: string;
  node: DagNode;
  dependencyResults: Array<{ nodeKey: string; title: string; result: string }>;
  skillText: string;
  approval: "ask" | "auto";
}): string {
  const deps =
    input.dependencyResults.length === 0
      ? "(sin dependencias)"
      : input.dependencyResults
          .map((d) => `## ${d.nodeKey}: ${d.title}\n${d.result}`)
          .join("\n\n");

  return `${input.skillText}

# Encargo global
${input.goal}

# Workspace
cwd: ${input.cwd}

# Nodo asignado
id: ${input.node.nodeKey}
title: ${input.node.title}
role: ${input.node.role}
description:
${input.node.description}

acceptance:
${input.node.acceptance}

# Resultados de dependencias
${deps}

# Política de aprobación
${input.approval === "auto" ? "Puedes ejecutar comandos necesarios sin pedir confirmación." : "Evita comandos destructivos; documenta si necesitas aprobación."}

# Instrucciones
Ejecuta SOLO este nodo. Usa herramientas del agente (leer/editar archivos, terminal, tests).
Al terminar, responde con un resumen claro de lo hecho, archivos tocados y cómo cumple el acceptance.
No replanifiques el DAG completo.
`;
}

export function buildVerifyPrompt(input: {
  goal: string;
  cwd: string;
  nodes: Array<{
    nodeKey: string;
    title: string;
    acceptance: string;
    status: string;
    result: string | null;
    error: string | null;
  }>;
  skillText: string;
}): string {
  const body = input.nodes
    .map(
      (n) =>
        `### ${n.nodeKey} [${n.status}] ${n.title}\nacceptance: ${n.acceptance}\nresult:\n${n.result ?? "(vacío)"}\nerror: ${n.error ?? "none"}`,
    )
    .join("\n\n");

  return `${input.skillText}

# Encargo
${input.goal}

# Workspace
cwd: ${input.cwd}

# Nodos ejecutados
${body}

# Tarea
Verifica si el encargo cumple los acceptance criteria.
Puedes inspeccionar el filesystem y correr tests/comandos de comprobación.
Responde SOLO con JSON válido (sin markdown):
{
  "passed": true,
  "summary": "resumen de verificación",
  "failedNodeIds": [],
  "artifacts": ["ruta/relativa"]
}

Si algo falla, pon passed=false y lista failedNodeIds con los ids a reabrir.
`;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // try fenced block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim());
    }
    // try first {...}
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No se pudo parsear JSON de la respuesta del agente");
  }
}
