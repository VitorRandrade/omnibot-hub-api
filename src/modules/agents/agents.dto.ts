import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  avatar: z.string().max(10).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().default('gpt-4'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000),
  channels: z.array(z.string()).optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().max(10).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(4000).optional(),
  status: z.enum(['online', 'offline', 'maintenance']).optional(),
  channels: z.array(z.string()).optional(),
});

export const updateAgentStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'maintenance']),
});

export type CreateAgentDTO = z.infer<typeof createAgentSchema>;
export type UpdateAgentDTO = z.infer<typeof updateAgentSchema>;
export type UpdateAgentStatusDTO = z.infer<typeof updateAgentStatusSchema>;
