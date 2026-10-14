import { randomUUID } from 'node:crypto';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { DataSource } from 'typeorm';

import { env } from './config/env.js';
import { openApiDocument } from './docs/openapi.js';
import { createInstrumentRouter } from './modules/instruments/instrument.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import { createPortfolioRouter } from './modules/portfolio/portfolio.routes.js';
import { AppError } from './shared/errors/AppError.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFoundHandler } from './shared/middleware/not-found.js';

const logger = pino({ level: env.LOG_LEVEL });

export function createApp(dataSource: DataSource) {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.headers['x-request-id']?.toString() ?? randomUUID(),
    }),
  );
  app.use((request, response, next) => {
    response.setHeader('x-request-id', String(request.id));
    next();
  });
  app.use(express.json());

  app.get('/health', (request, response) => {
    response.status(200).json({ status: 'ok', requestId: request.id });
  });

  app.get('/openapi.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get('/ready', async (request, response, next) => {
    try {
      await dataSource.query('SELECT 1');
      response.status(200).json({ status: 'ready', requestId: request.id });
    } catch {
      next(new AppError('DATABASE_UNAVAILABLE', 503, 'Database is unavailable'));
    }
  });

  app.use('/instruments', createInstrumentRouter(dataSource));
  app.use('/users', createOrderRouter(dataSource));
  app.use('/users', createPortfolioRouter(dataSource));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
