import { z } from "zod";

export const PhaseSchema = z.enum([
  "describe",
  "analyze",
  "plan",
  "execute",
  "verify",
  "deliver",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const NodeStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "blocked",
  "done",
  "failed",
  "skipped",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const EncargoStatusSchema = z.enum([
  "created",
  "analyzing",
  "planning",
  "executing",
  "verifying",
  "delivered",
  "failed",
  "cancelled",
]);
export type EncargoStatus = z.infer<typeof EncargoStatusSchema>;

export const PlanNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  dependsOn: z.array(z.string()).default([]),
  role: z.string().default("worker"),
  acceptance: z.string().default(""),
  model: z.string().optional(),
});
export type PlanNode = z.infer<typeof PlanNodeSchema>;

export const PlanResultSchema = z.object({
  summary: z.string().default(""),
  risks: z.array(z.string()).default([]),
  workspaceNotes: z.string().default(""),
  nodes: z.array(PlanNodeSchema).min(1),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;

export const VerifyResultSchema = z.object({
  passed: z.boolean(),
  summary: z.string().default(""),
  failedNodeIds: z.array(z.string()).default([]),
  artifacts: z.array(z.string()).default([]),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

export interface Encargo {
  id: string;
  goal: string;
  cwd: string;
  status: EncargoStatus;
  phase: Phase;
  summary: string | null;
  planJson: string | null;
  verifyJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DagNode {
  id: string;
  encargoId: string;
  nodeKey: string;
  title: string;
  description: string;
  dependsOn: string[];
  role: string;
  acceptance: string;
  model: string | null;
  status: NodeStatus;
  agentId: string | null;
  runId: string | null;
  result: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: number;
  encargoId: string;
  nodeKey: string | null;
  phase: Phase | null;
  category: string;
  message: string;
  metaJson: string | null;
  createdAt: string;
}

export type StreamHandler = (line: string) => void;
