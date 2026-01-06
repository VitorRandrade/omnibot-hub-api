import { Request, Response, NextFunction } from 'express';
import { flowsService } from './flows.service.js';
import {
  createFlowSchema,
  updateFlowSchema,
  executeFlowSchema,
  flowQuerySchema,
  executionQuerySchema,
} from './flows.schema.js';
import { AuthenticatedRequest } from '../../shared/middleware/auth.middleware.js';

class FlowsController {
  // GET /flows - List flows
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;

      const params = flowQuerySchema.parse(req.query);
      const result = await flowsService.list(tenantId, params);

      res.json({
        success: true,
        data: result.flows,
        meta: {
          total: result.total,
          page: result.page,
          perPage: result.perPage,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /flows/stats - Get stats
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;

      const stats = await flowsService.getStats(tenantId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /flows/templates - Get templates
  async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const { category } = req.query;
      const templates = await flowsService.getTemplates(category as string);

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /flows/:id - Get flow by ID
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const flow = await flowsService.getById(tenantId, id);

      res.json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows - Create flow
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;

      const data = createFlowSchema.parse(req.body);
      const flow = await flowsService.create(tenantId, data);

      res.status(201).json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows/from-template - Create from template
  async createFromTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { templateId, name } = req.body;

      if (!templateId) {
        return res.status(400).json({
          success: false,
          error: 'Template ID is required',
        });
      }

      const flow = await flowsService.createFromTemplate(tenantId, templateId, name);

      res.status(201).json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /flows/:id - Update flow
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const data = updateFlowSchema.parse(req.body);
      const flow = await flowsService.update(tenantId, id, data);

      res.json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /flows/:id - Delete flow
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      await flowsService.delete(tenantId, id);

      res.json({
        success: true,
        message: 'Flow deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows/:id/activate - Activate flow
  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const flow = await flowsService.activate(tenantId, id);

      res.json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows/:id/deactivate - Deactivate flow
  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const flow = await flowsService.deactivate(tenantId, id);

      res.json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows/:id/execute - Execute flow manually
  async execute(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const data = executeFlowSchema.parse(req.body);
      const execution = await flowsService.execute(tenantId, id, data);

      res.json({
        success: true,
        data: execution,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /flows/:id/duplicate - Duplicate flow
  async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;
      const { name } = req.body;

      const flow = await flowsService.duplicate(tenantId, id, name);

      res.status(201).json({
        success: true,
        data: flow,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /flows/:id/executions - Get flow executions
  async getExecutions(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const tenantId = authReq.user.tenant_id || authReq.user.id;
      const { id } = req.params;

      const params = executionQuerySchema.parse(req.query);
      const result = await flowsService.getExecutions(tenantId, id, params);

      res.json({
        success: true,
        data: result.executions,
        meta: {
          total: result.total,
          page: result.page,
          perPage: result.perPage,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const flowsController = new FlowsController();
