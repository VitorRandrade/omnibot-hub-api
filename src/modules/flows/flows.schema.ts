import { z } from 'zod';

// Flow types
export const flowTypes = ['automation', 'chatbot', 'integration', 'notification'] as const;
export const flowStatus = ['ativo', 'inativo', 'rascunho', 'erro'] as const;
export const triggerTypes = ['webhook', 'schedule', 'event', 'manual'] as const;
export const executionStatus = ['pendente', 'executando', 'sucesso', 'erro', 'cancelado'] as const;

// Node schema for flow editor
export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.any()).optional(),
});

// Edge schema for flow editor
export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

// Create flow schema
export const createFlowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(flowTypes).default('automation'),
  triggerType: z.enum(triggerTypes).optional(),
  triggerConfig: z.record(z.any()).optional(),
  nodes: z.array(flowNodeSchema).optional(),
  edges: z.array(flowEdgeSchema).optional(),
  variables: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

// Update flow schema
export const updateFlowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.enum(flowTypes).optional(),
  status: z.enum(flowStatus).optional(),
  triggerType: z.enum(triggerTypes).optional(),
  triggerConfig: z.record(z.any()).optional(),
  nodes: z.array(flowNodeSchema).optional(),
  edges: z.array(flowEdgeSchema).optional(),
  variables: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

// Execute flow schema
export const executeFlowSchema = z.object({
  inputData: z.record(z.any()).optional(),
  triggerType: z.enum(triggerTypes).default('manual'),
  triggerData: z.record(z.any()).optional(),
});

// Query params schema
export const flowQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  type: z.enum(flowTypes).optional(),
  status: z.enum(flowStatus).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'name', 'total_execucoes']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Execution query schema
export const executionQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(executionStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Types
export type FlowType = z.infer<typeof createFlowSchema>['type'];
export type FlowStatus = (typeof flowStatus)[number];
export type TriggerType = (typeof triggerTypes)[number];
export type ExecutionStatus = (typeof executionStatus)[number];
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type CreateFlowData = z.infer<typeof createFlowSchema>;
export type UpdateFlowData = z.infer<typeof updateFlowSchema>;
export type ExecuteFlowData = z.infer<typeof executeFlowSchema>;
export type FlowQueryParams = z.infer<typeof flowQuerySchema>;
export type ExecutionQueryParams = z.infer<typeof executionQuerySchema>;
