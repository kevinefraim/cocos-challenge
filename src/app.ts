import { randomUUID } from 'node:crypto';
import express from 'express';
import pino, { type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { DataSource } from 'typeorm';

import { User } from './database/entities/User.js';
import { Instrument } from './database/entities/Instrument.js';
import { TypeOrmInstrumentRepository } from './database/repositories/typeorm-instrument.repository.js';
import { TypeOrmOrderRepository } from './database/repositories/typeorm-order.repository.js';
import { TypeOrmPortfolioRepository } from './database/repositories/typeorm-portfolio.repository.js';
import { openApiDocument } from './docs/openapi.js';
import { createInstrumentRouter } from './modules/instruments/instrument.routes.js';
import { createOrderRouter } from './modules/orders/order.routes.js';
import { createPortfolioRouter } from './modules/portfolio/portfolio.routes.js';
import { createAppError } from './shared/errors/error-catalog.js';
import { HTTP_STATUS, JSON_BODY_LIMIT, REQUEST_ID_HEADER } from './shared/http/constants.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFoundHandler } from './shared/middleware/not-found.js';

export function createApp(
  dataSource: DataSource,
  logger: Logger = pino(),
  commit: string | null = null,
) {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      // Allowlist: headers, query strings, bodies and raw error messages may contain secrets.
      serializers: {
        req: (request) => ({
          id: request.id,
          method: request.method,
          path: request.url?.split('?')[0],
        }),
        res: (response) => ({ statusCode: response.statusCode }),
        err: (error) => ({ type: error.type, code: error.code }),
      },
      genReqId: (request) => request.headers[REQUEST_ID_HEADER]?.toString() ?? randomUUID(),
    }),
  );
  app.use((request, response, next) => {
    response.setHeader(REQUEST_ID_HEADER, String(request.id));
    next();
  });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', (request, response) => {
    response.status(HTTP_STATUS.OK).json({ status: 'ok', commit, requestId: request.id });
  });

  app.get('/openapi.json', (_request, response) => {
    response.status(HTTP_STATUS.OK).json(openApiDocument);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get('/ready', async (request, response, next) => {
    try {
      await dataSource.getRepository(User).exists();
      response.status(HTTP_STATUS.OK).json({ status: 'ready', requestId: request.id });
    } catch {
      next(createAppError('DATABASE_UNAVAILABLE'));
    }
  });

  // Composition root: sólo aquí se eligen las implementaciones de persistencia.
  app.use(
    '/instruments',
    createInstrumentRouter(new TypeOrmInstrumentRepository(dataSource.getRepository(Instrument))),
  );
  app.use('/users', createOrderRouter(new TypeOrmOrderRepository(dataSource)));
  app.use('/users', createPortfolioRouter(new TypeOrmPortfolioRepository(dataSource)));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
