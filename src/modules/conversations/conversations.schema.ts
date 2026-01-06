import { z } from 'zod';

// Status da conversa em Português (como no banco)
export const conversationStatusPt = ['aberta', 'em_atendimento', 'resolvida', 'fechada'] as const;

// Status em Inglês (para API)
export const conversationStatusEn = ['open', 'in_progress', 'resolved', 'closed'] as const;

// Canais suportados
export const channelTypes = ['whatsapp', 'instagram', 'facebook', 'telegram', 'web', 'email'] as const;

export const createConversationSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  agentId: z.string().uuid('Invalid agent ID').optional(),
  companyId: z.string().uuid('Invalid company ID').optional(),
  channel: z.enum(channelTypes),
  metadata: z.record(z.any()).optional(),
});

export const updateConversationStatusSchema = z.object({
  status: z.enum(conversationStatusEn),
});

export const assignAgentSchema = z.object({
  agentId: z.string().uuid('Invalid agent ID'),
});

export const listConversationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(conversationStatusEn).optional(),
  channel: z.enum(channelTypes).optional(),
  agentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type CreateConversationDTO = z.infer<typeof createConversationSchema>;
export type UpdateConversationStatusDTO = z.infer<typeof updateConversationStatusSchema>;
export type AssignAgentDTO = z.infer<typeof assignAgentSchema>;
export type ListConversationsDTO = z.infer<typeof listConversationsSchema>;
