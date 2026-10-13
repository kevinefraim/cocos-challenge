import { randomUUID } from 'node:crypto';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { DataSource } from 'typeorm';

import { env } from './config/env.js';
import { createInstrumentRouter } from './modules/instruments/instrument.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import { createPortfolioRouter } from './modules/portfolio/portfolio.routes.js';
import { errorHandler } from './shared/middleware/error-handler.js';

const logger = pino({ level: env.LOG_LEVEL });

export function createApp(dataSource: DataSource) {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger, genReqId: (request) => request.headers['x-request-id']?.toString() ?? randomUUID() }));
  app.use((request, response, next) => {
    response.setHeader('x-request-id', String(request.id));
    next();
  });

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response, next) => {
    try {
      await dataSource.query('SELECT 1');
      response.status(200).json({ status: 'ready' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/instruments', createInstrumentRouter(dataSource));
  app.use('/users', createOrderRouter(dataSource));
  app.use('/users', createPortfolioRouter(dataSource));

  app.use(errorHandler);

  return app;
}
