import type { RequestHandler } from 'express';

import { createAppError } from '../errors/error-catalog.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(createAppError('NOT_FOUND'));
};
