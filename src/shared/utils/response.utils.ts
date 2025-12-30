import { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    perPage?: number;
    totalPages?: number;
  };
}

interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: PaginationMeta
): void => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.perPage),
    };

    // Set headers for pagination
    res.setHeader('X-Total-Count', meta.total.toString());
    res.setHeader('X-Page', meta.page.toString());
    res.setHeader('X-Per-Page', meta.perPage.toString());
  }

  res.status(statusCode).json(response);
};

export const sendCreated = <T>(res: Response, data: T): void => {
  sendSuccess(res, data, 201);
};

export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};
