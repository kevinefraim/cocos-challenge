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
import { createAppError } from './shared/errors/error-catalog.js';
import { HTTP_STATUS, JSON_BODY_LIMIT, REQUEST_ID_HEADER } from './shared/http/constants.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFoundHandler } from './shared/middleware/not-found.js';

const logger = pino({ level: env.LOG_LEVEL });

export function createApp(dataSource: DataSource) {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.headers[REQUEST_ID_HEADER]?.toString() ?? randomUUID(),
    }),
  );
  app.use((request, response, next) => {
    response.setHeader(REQUEST_ID_HEADER, String(request.id));
    next();
  });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', (request, response) => {
    response.status(HTTP_STATUS.OK).json({ status: 'ok', requestId: request.id });
  });

  app.get('/openapi.json', (_request, response) => {
    response.status(HTTP_STATUS.OK).json(openApiDocument);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get('/ready', async (request, response, next) => {
    try {
      await dataSource.query('SELECT 1');
      response.status(HTTP_STATUS.OK).json({ status: 'ready', requestId: request.id });
    } catch {
      next(createAppError('DATABASE_UNAVAILABLE'));
    }
  });

  app.use('/instruments', createInstrumentRouter(dataSource));
  app.use('/users', createOrderRouter(dataSource));
  app.use('/users', createPortfolioRouter(dataSource));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
