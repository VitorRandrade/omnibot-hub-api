import { z } from 'zod';

// Tipos de remetente
export const senderTypes = ['customer', 'agent', 'system', 'bot'] as const;

// Tipos de mensagem
export const messageTypes = ['text', 'image', 'audio', 'video', 'document', 'location', 'sticker', 'contact'] as const;

export const createMessageSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  senderType: z.enum(senderTypes),
  senderId: z.string().uuid('Invalid sender ID').optional(),
  content: z.string().min(1, 'Message content is required'),
  type: z.enum(messageTypes).default('text'),
  metadata: z.record(z.any()).optional(),
  replyToId: z.string().uuid().optional(),
});

export const listMessagesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
  after: z.string().datetime().optional(),
});

export const markAsReadSchema = z.object({
  messageIds: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
});

export type CreateMessageDTO = z.infer<typeof createMessageSchema>;
export type ListMessagesDTO = z.infer<typeof listMessagesSchema>;
export type MarkAsReadDTO = z.infer<typeof markAsReadSchema>;
