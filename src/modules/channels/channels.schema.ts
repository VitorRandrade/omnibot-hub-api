import { z } from 'zod';

// Tipos de canais suportados
export const channelTypes = ['whatsapp', 'instagram', 'facebook', 'telegram', 'web', 'email'] as const;

// Status do canal
export const channelStatus = ['connected', 'disconnected', 'pending', 'error'] as const;

export const createChannelSchema = z.object({
  type: z.enum(channelTypes),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  credentials: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    accessToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    businessAccountId: z.string().optional(),
    webhookVerifyToken: z.string().optional(),
  }).optional(),
  settings: z.object({
    autoReply: z.boolean().optional(),
    welcomeMessage: z.string().optional(),
    businessHours: z.object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    }).optional(),
  }).optional(),
  isMetaOfficial: z.boolean().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.enum(channelStatus).optional(),
  credentials: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    accessToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    businessAccountId: z.string().optional(),
    webhookVerifyToken: z.string().optional(),
  }).optional(),
  settings: z.object({
    autoReply: z.boolean().optional(),
    welcomeMessage: z.string().optional(),
    businessHours: z.object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    }).optional(),
  }).optional(),
});

export const connectChannelSchema = z.object({
  credentials: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    accessToken: z.string().optional(),
    phoneNumberId: z.string().optional(),
    businessAccountId: z.string().optional(),
    webhookVerifyToken: z.string().optional(),
  }),
});

export const listChannelsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  type: z.enum(channelTypes).optional(),
  status: z.enum(channelStatus).optional(),
  search: z.string().optional(),
});

export type CreateChannelDTO = z.infer<typeof createChannelSchema>;
export type UpdateChannelDTO = z.infer<typeof updateChannelSchema>;
export type ConnectChannelDTO = z.infer<typeof connectChannelSchema>;
export type ListChannelsDTO = z.infer<typeof listChannelsSchema>;
