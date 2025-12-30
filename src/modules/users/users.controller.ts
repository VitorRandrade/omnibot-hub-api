import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service.js';
import { createUserSchema, updateUserSchema } from './users.dto.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';

export class UsersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const search = req.query.search as string;

      const { users, total } = await usersService.list({ page, perPage, search });
      sendSuccess(res, users, 200, { total, page, perPage });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.getById(req.params.id);
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createUserSchema.parse(req.body);
      const user = await usersService.create(data);
      sendCreated(res, user);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = updateUserSchema.parse(req.body);
      const user = await usersService.update(req.params.id, data);
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.delete(req.params.id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
