import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service.js';
import { createProductSchema, updateProductSchema } from './products.dto.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';

export class ProductsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const {
        page = '1',
        perPage = '20',
        search,
        category,
        status,
        minPrice,
        maxPrice,
        sortBy,
        sortOrder,
      } = req.query;

      const { products, total } = await productsService.list({
        userId,
        page: parseInt(page as string),
        perPage: parseInt(perPage as string),
        search: search as string,
        category: category as string,
        status: status as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });

      sendSuccess(res, products, 200, {
        total,
        page: parseInt(page as string),
        perPage: parseInt(perPage as string),
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const product = await productsService.getById(req.params.id, userId);
      sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createProductSchema.parse(req.body);
      const product = await productsService.create(userId, data);
      sendCreated(res, product);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = updateProductSchema.parse(req.body);
      const product = await productsService.update(req.params.id, userId, data);
      sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await productsService.delete(req.params.id, userId);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await productsService.getStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const categories = await productsService.getCategories(userId);
      sendSuccess(res, categories);
    } catch (error) {
      next(error);
    }
  }

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = req.query.q as string || '';
      const limit = parseInt(req.query.limit as string) || 5;
      const products = await productsService.searchForAgent(userId, query, limit);
      sendSuccess(res, products);
    } catch (error) {
      next(error);
    }
  }
}

export const productsController = new ProductsController();
