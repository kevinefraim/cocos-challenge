import { randomUUID } from 'node:crypto';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';

const logger = pino({ level: env.LOG_LEVEL });

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger, genReqId: (request) => request.headers['x-request-id']?.toString() ?? randomUUID() }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  return app;
}
