import { Request, Response, NextFunction } from 'express';
import { conversationsService } from './conversations.service.js';
import {
  createConversationSchema,
  updateConversationStatusSchema,
  assignAgentSchema,
  listConversationsSchema,
} from './conversations.schema.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';

export class ConversationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const params = listConversationsSchema.parse(req.query);

      const { conversations, total } = await conversationsService.list({
        userId,
        page: params.page,
        perPage: params.perPage,
        status: params.status,
        channel: params.channel,
        agentId: params.agentId,
        customerId: params.customerId,
        search: params.search,
      });

      sendSuccess(res, conversations, 200, {
        total,
        page: params.page,
        perPage: params.perPage,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversation = await conversationsService.getById(req.params.id, userId);
      sendSuccess(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createConversationSchema.parse(req.body);
      const conversation = await conversationsService.create(userId, data);
      sendCreated(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status } = updateConversationStatusSchema.parse(req.body);
      const conversation = await conversationsService.updateStatus(req.params.id, userId, status);
      sendSuccess(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async assignAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = assignAgentSchema.parse(req.body);
      const conversation = await conversationsService.assignAgent(req.params.id, userId, data);
      sendSuccess(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async close(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversation = await conversationsService.close(req.params.id, userId);
      sendSuccess(res, conversation);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await conversationsService.getStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }
}

export const conversationsController = new ConversationsController();
