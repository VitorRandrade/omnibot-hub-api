import { z } from 'zod';

export const uploadImageSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
});

export const updateImageSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
});

export type UploadImageDTO = z.infer<typeof uploadImageSchema>;
export type UpdateImageDTO = z.infer<typeof updateImageSchema>;
