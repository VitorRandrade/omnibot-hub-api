import { db } from '../../config/database.js';
import { NotFoundError } from '../../shared/middleware/error.middleware.js';
import { CreateProductDTO, UpdateProductDTO } from './products.dto.js';

// Interface que reflete o schema da tabela "produtos" na migration 002
interface ProductDB {
  id: string;
  tenant_id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  descricao: string | null;
  preco: number;
  estoque: number;
  status: string;
  imagem_url: string | null;
  atributos: Record<string, any> | null;
  total_vendas: number;
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

// Mapeamento de status EN -> PT (para escrita no banco)
const statusEnToPt: Record<string, string> = {
  'active': 'ativo',
  'inactive': 'inativo',
  'out_of_stock': 'esgotado',
  'low_stock': 'baixo_estoque',
};

// Mapeamento de status PT -> EN (para leitura do banco)
const statusPtToEn: Record<string, string> = {
  'ativo': 'active',
  'inativo': 'inactive',
  'esgotado': 'out_of_stock',
  'baixo_estoque': 'low_stock',
};

function mapStatusToEn(status: string): string {
  return statusPtToEn[status?.toLowerCase()] || status || 'active';
}

function mapStatusToPt(status: string): string {
  return statusEnToPt[status?.toLowerCase()] || status || 'ativo';
}

// Função helper para mapear do banco para resposta da API
function mapProductToResponse(product: ProductDB): ProductResponse {
  const atributos = product.atributos || {};

  return {
    id: product.id,
    user_id: product.tenant_id,
    name: product.nome,
    sku: product.sku,
    category: product.categoria,
    description: product.descricao,
    price: parseFloat(String(product.preco)) || 0,
    promotional_price: atributos.promotional_price || null,
    stock_quantity: product.estoque || 0,
    status: mapStatusToEn(product.status),
    type: atributos.type || 'physical',
    image_url: product.imagem_url,
    images: product.imagem_url ? [product.imagem_url] : [],
    tags: atributos.tags || [],
    attributes: atributos,
    total_sales: product.total_vendas || 0,
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
      // Converter status EN para PT para busca
      const dbStatus = mapStatusToPt(status);
      conditions.push(`status = $${paramIndex++}`);
      values.push(dbStatus);
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
      stock: 'estoque',
    };
    const sortColumn = sortColumnMap[sortBy] || 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    try {
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
    } catch (dbError: any) {
      // Se tabela não existe, retornar vazio
      if (dbError.code === '42P01') {
        return { products: [], total: 0 };
      }
      throw dbError;
    }
  }

  async getById(id: string, userId: string): Promise<ProductResponse> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('Product');
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query<ProductDB>(
        'SELECT * FROM produtos WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Product');
      }

      return mapProductToResponse(result.rows[0]);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Product');
      }
      throw dbError;
    }
  }

  async create(userId: string, data: CreateProductDTO): Promise<ProductResponse> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    // Montar atributos com campos extras
    const atributos = {
      ...(data.attributes || {}),
      type: 'physical',
      tags: [],
    };

    // Converter status EN para PT
    const dbStatus = mapStatusToPt(data.status || 'active');

    try {
      const result = await db.query<ProductDB>(
        `INSERT INTO produtos (tenant_id, nome, sku, descricao, preco, estoque, categoria, status, imagem_url, atributos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tenantId,
          data.name,
          data.sku || null,
          data.description || null,
          data.price || 0,
          data.stockQuantity || 0,
          data.category || null,
          dbStatus,
          data.imageUrl || null,
          JSON.stringify(atributos),
        ]
      );

      return mapProductToResponse(result.rows[0]);
    } catch (dbError: any) {
      // Se tabela não existe, tentar criar com schema inglês como fallback
      if (dbError.code === '42P01' || dbError.code === '42703') {
        const result = await db.query(
          `INSERT INTO products (user_id, name, sku, description, price, stock_quantity, category, status, image_url, attributes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            userId,
            data.name,
            data.sku || null,
            data.description || null,
            data.price || 0,
            data.stockQuantity || 0,
            data.category || null,
            data.status || 'active',
            data.imageUrl || null,
            JSON.stringify(atributos),
          ]
        );
        return {
          ...result.rows[0],
          user_id: result.rows[0].user_id,
          promotional_price: null,
          type: 'physical',
          images: result.rows[0].image_url ? [result.rows[0].image_url] : [],
          tags: [],
          total_sales: 0,
        };
      }
      throw dbError;
    }
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

    if (data.sku !== undefined) {
      updates.push(`sku = $${paramIndex++}`);
      values.push(data.sku);
    }

    if (data.description !== undefined) {
      updates.push(`descricao = $${paramIndex++}`);
      values.push(data.description);
    }

    if (data.price !== undefined) {
      updates.push(`preco = $${paramIndex++}`);
      values.push(data.price);
    }

    if (data.stockQuantity !== undefined) {
      updates.push(`estoque = $${paramIndex++}`);
      values.push(data.stockQuantity);
    }

    if (data.category !== undefined) {
      updates.push(`categoria = $${paramIndex++}`);
      values.push(data.category);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(mapStatusToPt(data.status));
    }

    if (data.imageUrl !== undefined) {
      updates.push(`imagem_url = $${paramIndex++}`);
      values.push(data.imageUrl || null);
    }

    // Atualizar atributos se necessário
    if (data.attributes !== undefined) {
      const newAtributos = {
        ...current.attributes,
        ...(data.attributes || {}),
      };
      updates.push(`atributos = $${paramIndex++}`);
      values.push(JSON.stringify(newAtributos));
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(id, tenantId);

    try {
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
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Product');
      }
      throw dbError;
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query(
        'DELETE FROM produtos WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Product');
      }
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        throw new NotFoundError('Product');
      }
      throw dbError;
    }
  }

  async getStats(userId: string): Promise<any> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return { total: 0, active: 0, lowStock: 0, outOfStock: 0, totalSales: 0 };
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'ativo' OR status = 'active')::int as active,
          COUNT(*) FILTER (WHERE status = 'baixo_estoque' OR status = 'low_stock')::int as low_stock,
          COUNT(*) FILTER (WHERE status = 'esgotado' OR status = 'out_of_stock')::int as out_of_stock,
          COALESCE(SUM(total_vendas), 0)::int as total_sales
         FROM produtos WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = result.rows[0];
      return {
        total: row.total || 0,
        active: row.active || 0,
        lowStock: row.low_stock || 0,
        outOfStock: row.out_of_stock || 0,
        totalSales: row.total_sales || 0,
      };
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return { total: 0, active: 0, lowStock: 0, outOfStock: 0, totalSales: 0 };
      }
      throw dbError;
    }
  }

  async getCategories(userId: string): Promise<string[]> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return [];
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query(
        `SELECT DISTINCT categoria FROM produtos
         WHERE tenant_id = $1 AND categoria IS NOT NULL
         ORDER BY categoria`,
        [tenantId]
      );

      return result.rows.map(row => row.categoria);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return [];
      }
      throw dbError;
    }
  }

  // Endpoint para agentes IA buscarem produtos (by userId)
  async searchForAgent(userId: string, query: string, limit: number = 5): Promise<ProductResponse[]> {
    const userResult = await db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return [];
    }
    const tenantId = userResult.rows[0].tenant_id;

    try {
      const result = await db.query<ProductDB>(
        `SELECT * FROM produtos
         WHERE tenant_id = $1 AND status = 'ativo'
           AND (nome ILIKE $2 OR descricao ILIKE $2)
         ORDER BY total_vendas DESC NULLS LAST
         LIMIT $3`,
        [tenantId, `%${query}%`, limit]
      );

      return result.rows.map(mapProductToResponse);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return [];
      }
      throw dbError;
    }
  }

  // Endpoint para agentes IA buscarem produtos (by tenantId - para uso com MCP key)
  async searchByTenantId(tenantId: string, query: string, limit: number = 5): Promise<ProductResponse[]> {
    try {
      const result = await db.query<ProductDB>(
        `SELECT * FROM produtos
         WHERE tenant_id = $1 AND status = 'ativo'
           AND (nome ILIKE $2 OR descricao ILIKE $2)
         ORDER BY total_vendas DESC NULLS LAST
         LIMIT $3`,
        [tenantId, `%${query}%`, limit]
      );

      return result.rows.map(mapProductToResponse);
    } catch (dbError: any) {
      if (dbError.code === '42P01') {
        return [];
      }
      throw dbError;
    }
  }
}

export const productsService = new ProductsService();
