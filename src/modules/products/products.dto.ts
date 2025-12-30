import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  sku: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be positive'),
  stockQuantity: z.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive', 'out_of_stock', 'low_stock']).default('active'),
  imageUrl: z.string().url().optional().nullable(),
  attributes: z.record(z.any()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  stockQuantity: z.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive', 'out_of_stock', 'low_stock']).optional(),
  imageUrl: z.string().url().optional().nullable(),
  attributes: z.record(z.any()).optional(),
});

export type CreateProductDTO = z.infer<typeof createProductSchema>;
export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
