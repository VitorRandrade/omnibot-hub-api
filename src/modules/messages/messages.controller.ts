import { Request, Response, NextFunction } from 'express';
import { messagesService } from './messages.service.js';
import {
  createMessageSchema,
  listMessagesSchema,
  markAsReadSchema,
} from './messages.schema.js';
import { sendSuccess, sendCreated } from '../../shared/utils/response.utils.js';

export class MessagesController {
  // GET /v1/conversations/:conversationId/messages
  async listByConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.conversationId;
      const params = listMessagesSchema.parse(req.query);

      const { messages, total } = await messagesService.listByConversation({
        userId,
        conversationId,
        page: params.page,
        perPage: params.perPage,
        before: params.before,
        after: params.after,
      });

      sendSuccess(res, messages, 200, {
        total,
        page: params.page,
        perPage: params.perPage,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /v1/conversations/:conversationId/messages
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.conversationId;

      const data = createMessageSchema.parse({
        ...req.body,
        conversationId,
      });

      const message = await messagesService.create(userId, data);
      sendCreated(res, message);
    } catch (error) {
      next(error);
    }
  }

  // POST /v1/conversations/:conversationId/messages/read
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.conversationId;
      const data = markAsReadSchema.parse(req.body);

      const count = await messagesService.markAsRead(
        userId,
        conversationId,
        data.messageIds
      );

      sendSuccess(res, { markedAsRead: count });
    } catch (error) {
      next(error);
    }
  }

  // GET /v1/conversations/:conversationId/messages/unread-count
  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.conversationId;

      const count = await messagesService.getUnreadCount(userId, conversationId);

      sendSuccess(res, { unreadCount: count });
    } catch (error) {
      next(error);
    }
  }

  // GET /v1/messages/:id
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const message = await messagesService.getById(req.params.id, userId);
      sendSuccess(res, message);
    } catch (error) {
      next(error);
    }
  }
}

export const messagesController = new MessagesController();
