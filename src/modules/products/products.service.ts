import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateProductDTO, UpdateProductDTO } from './products.dto.js';

// Interface que reflete o schema existente na VPS (tabela "produtos")
interface ProductDB {
  id: string;
  tenant_id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_promocional: number | null;
  categoria: string | null;
  status: string;
  tipo: string | null;
  imagens: string[] | null;
  tags: string[] | null;
  metadata: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

// Interface para resposta da API (compatível com frontend)
interface ProductResponse {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  price: number;
  promotional_price: number | null;
  stock_quantity: number;
  status: string;
  type: string | null;
  image_url: string | null;
  images: string[];
  tags: string[];
  attributes: Record<string, any> | null;
  total_sales: number;
  created_at: Date;
  updated_at: Date;
}

interface ListParams {
  userId: string;
  page: number;
  perPage: number;
  search?: string;
  category?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Função helper para mapear do banco para resposta da API
function mapProductToResponse(product: ProductDB): ProductResponse {
  const metadata = product.metadata || {};

  return {
    id: product.id,
    user_id: product.tenant_id,
    name: product.nome,
    sku: metadata.sku || null,
    category: product.categoria,
    description: product.descricao,
    price: parseFloat(String(product.preco)) || 0,
    promotional_price: product.preco_promocional ? parseFloat(String(product.preco_promocional)) : null,
    stock_quantity: metadata.stock_quantity || 0,
    status: product.status,
    type: product.tipo,
    image_url: product.imagens?.[0] || null,
    images: product.imagens || [],
    tags: product.tags || [],
    attributes: metadata,
    total_sales: metadata.total_sales || 0,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

export class ProductsService {
  async list(params: ListParams): Promise<{ products: ProductResponse[]; total: number }> {
    const {
      userId, page, perPage, search, category, status,
      minPrice, maxPrice, sortBy = 'created_at', sortOrder = 'desc'
    } = params;
    const offset = (page - 1) * perPage;

    // Obter tenant_id do usuário
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return { products: [], total: 0 };
    }
    const tenantId = userResult.rows[0].tenant_id;

    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(nome ILIKE $${paramIndex} OR descricao ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      conditions.push(`categoria = $${paramIndex++}`);
      values.push(category);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (minPrice !== undefined) {
      conditions.push(`preco >= $${paramIndex++}`);
      values.push(minPrice);
    }

    if (maxPrice !== undefined) {
      conditions.push(`preco <= $${paramIndex++}`);
      values.push(maxPrice);
    }

    const whereClause = conditions.join(' AND ');

    // Mapear sortBy para colunas do banco
    const sortColumnMap: Record<string, string> = {
      name: 'nome',
      price: 'preco',
      created_at: 'created_at',
    };
    const sortColumn = sortColumnMap[sortBy] || 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM produtos WHERE ${whereClause}`,
      values
    );

    const result = await db.query<ProductDB>(
      `SELECT * FROM produtos
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${order}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, perPage, offset]
    );

    return {
      products: result.rows.map(mapProductToResponse),
      total: parseInt(countResult.rows[0].count),
    };
  }

  async getById(id: string, userId: string): Promise<ProductResponse> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('Product');
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query<ProductDB>(
      'SELECT * FROM produtos WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Product');
    }

    return mapProductToResponse(result.rows[0]);
  }

  async create(userId: string, data: CreateProductDTO): Promise<ProductResponse> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    // Montar metadata com campos extras
    const metadata = {
      ...(data.attributes || {}),
      sku: data.sku || null,
      stock_quantity: data.stockQuantity || 0,
      total_sales: 0,
    };

    const result = await db.query<ProductDB>(
      `INSERT INTO produtos (tenant_id, nome, descricao, preco, categoria, status, tipo, imagens, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId,
        data.name,
        data.description || null,
        data.price || 0,
        data.category || null,
        data.status || 'active',
        'physical', // tipo padrão
        data.imageUrl ? [data.imageUrl] : [],
        [],
        JSON.stringify(metadata),
      ]
    );

    return mapProductToResponse(result.rows[0]);
  }

  async update(id: string, userId: string, data: UpdateProductDTO): Promise<ProductResponse> {
    // Primeiro, buscar o produto atual
    const current = await this.getById(id, userId);

    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    const tenantId = userResult.rows[0].tenant_id;

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

    if (data.price !== undefined) {
      updates.push(`preco = $${paramIndex++}`);
      values.push(data.price);
    }

    if (data.category !== undefined) {
      updates.push(`categoria = $${paramIndex++}`);
      values.push(data.category);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.imageUrl !== undefined) {
      updates.push(`imagens = $${paramIndex++}`);
      values.push(data.imageUrl ? [data.imageUrl] : []);
    }

    // Atualizar metadata se necessário
    if (data.sku !== undefined || data.stockQuantity !== undefined || data.attributes !== undefined) {
      const newMetadata = {
        ...current.attributes,
        ...(data.attributes || {}),
        sku: data.sku ?? current.sku,
        stock_quantity: data.stockQuantity ?? current.stock_quantity,
      };
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(newMetadata));
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(id, tenantId);

    const result = await db.query<ProductDB>(
      `UPDATE produtos SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Product');
    }

    return mapProductToResponse(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<void> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query(
      'DELETE FROM produtos WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Product');
    }
  }

  async getStats(userId: string): Promise<any> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return { total: 0, active: 0, low_stock: 0, out_of_stock: 0, total_sales: 0 };
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'low_stock') as low_stock,
        COUNT(*) FILTER (WHERE status = 'out_of_stock') as out_of_stock,
        COALESCE(SUM((metadata->>'total_sales')::int), 0) as total_sales
       FROM produtos WHERE tenant_id = $1`,
      [tenantId]
    );

    return result.rows[0];
  }

  async getCategories(userId: string): Promise<string[]> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return [];
    }
    const tenantId = userResult.rows[0].tenant_id;

    const result = await db.query(
      `SELECT DISTINCT categoria FROM produtos
       WHERE tenant_id = $1 AND categoria IS NOT NULL
       ORDER BY categoria`,
      [tenantId]
    );

    return result.rows.map(row => row.categoria);
  }

  // Endpoint para agentes IA buscarem produtos
  async searchForAgent(tenantId: string, query: string, limit: number = 5): Promise<ProductResponse[]> {
    const result = await db.query<ProductDB>(
      `SELECT * FROM produtos
       WHERE tenant_id = $1 AND status = 'active'
         AND (nome ILIKE $2 OR descricao ILIKE $2)
       ORDER BY (metadata->>'total_sales')::int DESC NULLS LAST
       LIMIT $3`,
      [tenantId, `%${query}%`, limit]
    );

    return result.rows.map(mapProductToResponse);
  }
}

export const productsService = new ProductsService();
