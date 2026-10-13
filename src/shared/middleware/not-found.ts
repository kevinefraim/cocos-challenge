import type { RequestHandler } from 'express';

import { AppError } from '../errors/AppError.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError('NOT_FOUND', 404, 'Route not found'));
};
