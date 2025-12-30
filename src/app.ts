import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import { corsOptions } from './config/cors.js';
import { env, isDev } from './config/env.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error.middleware.js';

// Routes
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import agentsRoutes from './modules/agents/agents.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import imagesRoutes from './modules/images/images.routes.js';
import documentsRoutes from './modules/documents/documents.routes.js';
import webhooksRoutes from './modules/webhooks/webhooks.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS
  app.use(cors(corsOptions));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging
  if (isDev) {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // Static files for uploads
  app.use('/uploads', express.static(path.join(__dirname, '..', env.UPLOADS_DIR)));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // API Routes (v1)
  const apiV1 = '/v1';

  app.use(`${apiV1}/auth`, authRoutes);
  app.use(`${apiV1}/users`, usersRoutes);
  app.use(`${apiV1}/agents`, agentsRoutes);
  app.use(`${apiV1}/products`, productsRoutes);
  app.use(`${apiV1}/images`, imagesRoutes);
  app.use(`${apiV1}/documents`, documentsRoutes);
  app.use(`${apiV1}/webhooks`, webhooksRoutes);

  // Public routes (no auth required)
  app.use(`${apiV1}/public/images`, imagesRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
};
