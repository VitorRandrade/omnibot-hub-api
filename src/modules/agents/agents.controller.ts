import { Request, Response, NextFunction } from 'express';
import { agentsService } from './agents.service.js';
import { createAgentSchema, updateAgentSchema, updateAgentStatusSchema } from './agents.dto.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';

export class AgentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const status = req.query.status as string;
      const search = req.query.search as string;

      const { agents, total } = await agentsService.list({
        userId,
        page,
        perPage,
        status,
        search,
      });

      sendSuccess(res, agents, 200, { total, page, perPage });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const agent = await agentsService.getById(req.params.id, userId);
      sendSuccess(res, agent);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createAgentSchema.parse(req.body);
      const agent = await agentsService.create(userId, data);
      sendCreated(res, agent);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = updateAgentSchema.parse(req.body);
      const agent = await agentsService.update(req.params.id, userId, data);
      sendSuccess(res, agent);
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status } = updateAgentStatusSchema.parse(req.body);
      const agent = await agentsService.updateStatus(req.params.id, userId, status);
      sendSuccess(res, agent);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await agentsService.delete(req.params.id, userId);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await agentsService.getStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }
}

export const agentsController = new AgentsController();
