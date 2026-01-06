import { db } from '../../config/database.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  CreateFlowData,
  UpdateFlowData,
  ExecuteFlowData,
  FlowQueryParams,
  ExecutionQueryParams
} from './flows.schema.js';

// Field mapping: Portuguese DB columns -> English API
const mapFlowFromDb = (row: any) => ({
  id: row.id,
  tenant_id: row.tenant_id,
  company_id: row.company_id,
  name: row.nome,
  description: row.descricao,
  type: row.tipo,
  status: mapStatusToEnglish(row.status),
  trigger_type: row.trigger_type,
  trigger_config: row.trigger_config,
  n8n_workflow_id: row.n8n_workflow_id,
  n8n_webhook_url: row.n8n_webhook_url,
  n8n_active: row.n8n_active,
  nodes: row.nodes || [],
  edges: row.edges || [],
  variables: row.variables || {},
  total_executions: row.total_execucoes || 0,
  successful_executions: row.execucoes_sucesso || 0,
  failed_executions: row.execucoes_erro || 0,
  last_execution: row.ultima_execucao,
  avg_execution_time: row.tempo_medio_execucao,
  version: row.versao,
  published_at: row.publicado_em,
  tags: row.tags || [],
  metadata: row.metadata,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapExecutionFromDb = (row: any) => ({
  id: row.id,
  tenant_id: row.tenant_id,
  flow_id: row.fluxo_id,
  status: mapExecutionStatusToEnglish(row.status),
  trigger_type: row.trigger_type,
  trigger_data: row.trigger_data,
  input_data: row.input_data,
  output_data: row.output_data,
  error_message: row.error_message,
  error_details: row.error_details,
  nodes_executed: row.nodes_executed || [],
  execution_time: row.tempo_execucao,
  started_at: row.iniciado_em,
  finished_at: row.finalizado_em,
  created_at: row.created_at,
});

const mapTemplateFromDb = (row: any) => ({
  id: row.id,
  name: row.nome,
  description: row.descricao,
  category: row.categoria,
  type: row.tipo,
  icon: row.icone,
  nodes: row.nodes || [],
  edges: row.edges || [],
  variables: row.variables || {},
  is_public: row.is_public,
  usage_count: row.uso_count || 0,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapStatusToEnglish = (status: string): string => {
  const map: Record<string, string> = {
    'ativo': 'active',
    'inativo': 'inactive',
    'rascunho': 'draft',
    'erro': 'error',
  };
  return map[status] || status;
};

const mapStatusToPortuguese = (status: string): string => {
  const map: Record<string, string> = {
    'active': 'ativo',
    'inactive': 'inativo',
    'draft': 'rascunho',
    'error': 'erro',
  };
  return map[status] || status;
};

const mapExecutionStatusToEnglish = (status: string): string => {
  const map: Record<string, string> = {
    'pendente': 'pending',
    'executando': 'running',
    'sucesso': 'success',
    'erro': 'error',
    'cancelado': 'cancelled',
  };
  return map[status] || status;
};

class FlowsService {
  // List flows with pagination and filters
  async list(tenantId: string, params: FlowQueryParams) {
    const { page, perPage, type, status, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * perPage;

    // SECURITY: Whitelist allowed sort columns to prevent SQL injection
    const sortColumnMap: Record<string, string> = {
      'created_at': 'created_at',
      'updated_at': 'updated_at',
      'name': 'nome',
      'total_execucoes': 'total_execucoes',
    };
    const sortColumn = sortColumnMap[sortBy] || 'created_at';
    // SECURITY: Validate sortOrder to only allow ASC/DESC
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let query = `
      SELECT * FROM fluxos
      WHERE tenant_id = $1
    `;
    const queryParams: any[] = [tenantId];
    let paramIndex = 2;

    if (type) {
      query += ` AND tipo = $${paramIndex}`;
      queryParams.push(type);
      paramIndex++;
    }

    if (status) {
      const ptStatus = mapStatusToPortuguese(status);
      query += ` AND status = $${paramIndex}`;
      queryParams.push(ptStatus);
      paramIndex++;
    }

    if (search) {
      query += ` AND (nome ILIKE $${paramIndex} OR descricao ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await db.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      queryParams
    );
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination (using validated safeSortOrder)
    query += ` ORDER BY ${sortColumn} ${safeSortOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(perPage, offset);

    const result = await db.query(query, queryParams);

    return {
      flows: result.rows.map(mapFlowFromDb),
      total,
      page,
      perPage,
    };
  }

  // Get flow by ID
  async getById(tenantId: string, flowId: string) {
    const result = await db.query(
      'SELECT * FROM fluxos WHERE id = $1 AND tenant_id = $2',
      [flowId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Flow not found', 404);
    }

    return mapFlowFromDb(result.rows[0]);
  }

  // Create flow
  async create(tenantId: string, data: CreateFlowData) {
    const result = await db.query(
      `INSERT INTO fluxos (
        tenant_id, nome, descricao, tipo, trigger_type, trigger_config,
        nodes, edges, variables, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tenantId,
        data.name,
        data.description || null,
        data.type || 'automation',
        data.triggerType || null,
        JSON.stringify(data.triggerConfig || {}),
        JSON.stringify(data.nodes || []),
        JSON.stringify(data.edges || []),
        JSON.stringify(data.variables || {}),
        JSON.stringify(data.tags || []),
      ]
    );

    return mapFlowFromDb(result.rows[0]);
  }

  // Update flow
  async update(tenantId: string, flowId: string, data: UpdateFlowData) {
    // Check if flow exists
    await this.getById(tenantId, flowId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`nome = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`descricao = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.type !== undefined) {
      updates.push(`tipo = $${paramIndex++}`);
      values.push(data.type);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(mapStatusToPortuguese(data.status));
    }
    if (data.triggerType !== undefined) {
      updates.push(`trigger_type = $${paramIndex++}`);
      values.push(data.triggerType);
    }
    if (data.triggerConfig !== undefined) {
      updates.push(`trigger_config = $${paramIndex++}`);
      values.push(JSON.stringify(data.triggerConfig));
    }
    if (data.nodes !== undefined) {
      updates.push(`nodes = $${paramIndex++}`);
      values.push(JSON.stringify(data.nodes));
    }
    if (data.edges !== undefined) {
      updates.push(`edges = $${paramIndex++}`);
      values.push(JSON.stringify(data.edges));
    }
    if (data.variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(data.variables));
    }
    if (data.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(data.tags));
    }

    if (updates.length === 0) {
      return this.getById(tenantId, flowId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`versao = versao + 1`);

    values.push(flowId, tenantId);

    const result = await db.query(
      `UPDATE fluxos SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return mapFlowFromDb(result.rows[0]);
  }

  // Delete flow
  async delete(tenantId: string, flowId: string) {
    const result = await db.query(
      'DELETE FROM fluxos WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [flowId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Flow not found', 404);
    }

    return { deleted: true };
  }

  // Activate flow
  async activate(tenantId: string, flowId: string) {
    const result = await db.query(
      `UPDATE fluxos SET status = 'ativo', publicado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [flowId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Flow not found', 404);
    }

    return mapFlowFromDb(result.rows[0]);
  }

  // Deactivate flow
  async deactivate(tenantId: string, flowId: string) {
    const result = await db.query(
      `UPDATE fluxos SET status = 'inativo', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [flowId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Flow not found', 404);
    }

    return mapFlowFromDb(result.rows[0]);
  }

  // Execute flow manually
  async execute(tenantId: string, flowId: string, data: ExecuteFlowData) {
    // Get flow
    const flow = await this.getById(tenantId, flowId);

    // Create execution record
    const executionResult = await db.query(
      `INSERT INTO execucoes_fluxo (
        tenant_id, fluxo_id, status, trigger_type, trigger_data, input_data
      ) VALUES ($1, $2, 'executando', $3, $4, $5)
      RETURNING *`,
      [
        tenantId,
        flowId,
        data.triggerType || 'manual',
        JSON.stringify(data.triggerData || {}),
        JSON.stringify(data.inputData || {}),
      ]
    );

    const execution = executionResult.rows[0];

    // TODO: Actually execute the flow (integrate with n8n or internal engine)
    // For now, we'll simulate a successful execution

    // Update execution as successful
    const updatedExecution = await db.query(
      `UPDATE execucoes_fluxo SET
        status = 'sucesso',
        output_data = $1,
        tempo_execucao = $2,
        finalizado_em = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [
        JSON.stringify({ message: 'Flow executed successfully' }),
        Math.floor(Math.random() * 1000) + 100, // Simulated execution time
        execution.id,
      ]
    );

    // Update flow stats
    await db.query(
      `UPDATE fluxos SET
        total_execucoes = total_execucoes + 1,
        execucoes_sucesso = execucoes_sucesso + 1,
        ultima_execucao = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [flowId]
    );

    return mapExecutionFromDb(updatedExecution.rows[0]);
  }

  // Get flow executions
  async getExecutions(tenantId: string, flowId: string, params: ExecutionQueryParams) {
    const { page, perPage, status, startDate, endDate } = params;
    const offset = (page - 1) * perPage;

    let query = `
      SELECT * FROM execucoes_fluxo
      WHERE tenant_id = $1 AND fluxo_id = $2
    `;
    const queryParams: any[] = [tenantId, flowId];
    let paramIndex = 3;

    if (status) {
      const ptStatus = status === 'running' ? 'executando' :
                       status === 'success' ? 'sucesso' :
                       status === 'error' ? 'erro' :
                       status === 'cancelled' ? 'cancelado' : 'pendente';
      query += ` AND status = $${paramIndex}`;
      queryParams.push(ptStatus);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }

    // Count total
    const countResult = await db.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      queryParams
    );
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(perPage, offset);

    const result = await db.query(query, queryParams);

    return {
      executions: result.rows.map(mapExecutionFromDb),
      total,
      page,
      perPage,
    };
  }

  // Get flow stats
  async getStats(tenantId: string) {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ativo') as active,
        COUNT(*) FILTER (WHERE status = 'inativo') as inactive,
        COUNT(*) FILTER (WHERE status = 'rascunho') as draft,
        COUNT(*) FILTER (WHERE status = 'erro') as error,
        SUM(total_execucoes) as total_executions,
        SUM(execucoes_sucesso) as successful_executions,
        SUM(execucoes_erro) as failed_executions
       FROM fluxos
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const stats = result.rows[0];
    return {
      total: parseInt(stats.total) || 0,
      active: parseInt(stats.active) || 0,
      inactive: parseInt(stats.inactive) || 0,
      draft: parseInt(stats.draft) || 0,
      error: parseInt(stats.error) || 0,
      totalExecutions: parseInt(stats.total_executions) || 0,
      successfulExecutions: parseInt(stats.successful_executions) || 0,
      failedExecutions: parseInt(stats.failed_executions) || 0,
    };
  }

  // Get templates
  async getTemplates(category?: string) {
    let query = 'SELECT * FROM templates_fluxo WHERE is_public = true';
    const params: any[] = [];

    if (category) {
      query += ' AND categoria = $1';
      params.push(category);
    }

    query += ' ORDER BY uso_count DESC';

    const result = await db.query(query, params);
    return result.rows.map(mapTemplateFromDb);
  }

  // Create flow from template
  async createFromTemplate(tenantId: string, templateId: string, name: string) {
    // Get template
    const templateResult = await db.query(
      'SELECT * FROM templates_fluxo WHERE id = $1',
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      throw new AppError('Template not found', 404);
    }

    const template = templateResult.rows[0];

    // Create flow from template
    const result = await db.query(
      `INSERT INTO fluxos (
        tenant_id, nome, descricao, tipo, nodes, edges, variables
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tenantId,
        name || template.nome,
        template.descricao,
        template.tipo,
        JSON.stringify(template.nodes || []),
        JSON.stringify(template.edges || []),
        JSON.stringify(template.variables || {}),
      ]
    );

    // Increment template usage count
    await db.query(
      'UPDATE templates_fluxo SET uso_count = uso_count + 1 WHERE id = $1',
      [templateId]
    );

    return mapFlowFromDb(result.rows[0]);
  }

  // Duplicate flow
  async duplicate(tenantId: string, flowId: string, newName?: string) {
    const flow = await this.getById(tenantId, flowId);

    const result = await db.query(
      `INSERT INTO fluxos (
        tenant_id, nome, descricao, tipo, trigger_type, trigger_config,
        nodes, edges, variables, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tenantId,
        newName || `${flow.name} (cópia)`,
        flow.description,
        flow.type,
        flow.trigger_type,
        JSON.stringify(flow.trigger_config || {}),
        JSON.stringify(flow.nodes || []),
        JSON.stringify(flow.edges || []),
        JSON.stringify(flow.variables || {}),
        JSON.stringify(flow.tags || []),
      ]
    );

    return mapFlowFromDb(result.rows[0]);
  }
}

export const flowsService = new FlowsService();
