import { Request, Response, NextFunction } from 'express';
import { channelsService } from './channels.service.js';
import {
  createChannelSchema,
  updateChannelSchema,
  listChannelsSchema,
} from './channels.schema.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response.utils.js';

export class ChannelsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const params = listChannelsSchema.parse(req.query);

      const { channels, total } = await channelsService.list({
        userId,
        page: params.page,
        perPage: params.perPage,
        type: params.type,
        status: params.status,
        search: params.search,
      });

      sendSuccess(res, channels, 200, {
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
      const channel = await channelsService.getById(req.params.id, userId);
      sendSuccess(res, channel);
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = createChannelSchema.parse(req.body);
      const channel = await channelsService.create(userId, data);
      sendCreated(res, channel);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const data = updateChannelSchema.parse(req.body);
      const channel = await channelsService.update(req.params.id, userId, data);
      sendSuccess(res, channel);
    } catch (error) {
      next(error);
    }
  }

  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const channel = await channelsService.connect(req.params.id, userId);
      sendSuccess(res, channel);
    } catch (error) {
      next(error);
    }
  }

  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const channel = await channelsService.disconnect(req.params.id, userId);
      sendSuccess(res, channel);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      await channelsService.delete(req.params.id, userId);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const stats = await channelsService.getStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async generateWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const webhookUrl = await channelsService.generateWebhookUrl(req.params.id, userId);
      sendSuccess(res, { webhookUrl });
    } catch (error) {
      next(error);
    }
  }
}

export const channelsController = new ChannelsController();
