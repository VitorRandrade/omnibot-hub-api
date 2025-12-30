import { Request, Response, NextFunction } from 'express';
import { imagesService } from './images.service.js';
import { uploadImageSchema, updateImageSchema } from './images.dto.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';
import { env } from '../../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ImagesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const category = req.query.category as string;
      const search = req.query.search as string;

      const { images, total } = await imagesService.list({
        userId,
        page,
        perPage,
        category,
        search,
      });

      sendSuccess(res, images, 200, { total, page, perPage });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const image = await imagesService.getById(req.params.id, userId);
      sendSuccess(res, image);
    } catch (error) {
      next(error);
    }
  }

  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { message: 'No file uploaded', code: 'NO_FILE' },
        });
        return;
      }

      const data = uploadImageSchema.parse(req.body);
      const image = await imagesService.create(userId, req.file, data);
      sendCreated(res, image);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = updateImageSchema.parse(req.body);
      const image = await imagesService.update(req.params.id, userId, data);
      sendSuccess(res, image);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await imagesService.delete(req.params.id, userId);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const categories = await imagesService.getCategories(userId);
      sendSuccess(res, categories);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await imagesService.getStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  // Public endpoint for n8n and external access
  async servePublic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const image = await imagesService.getById(req.params.id);

      // Increment usage counter
      await imagesService.incrementUsage(image.id);

      const filePath = path.resolve(env.UPLOADS_DIR, 'images', image.file_path);

      res.setHeader('Content-Type', image.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${image.name}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
      res.setHeader('X-Image-Id', image.id);

      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  }
}

export const imagesController = new ImagesController();
