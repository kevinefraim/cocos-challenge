import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/AppError.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const appError = error instanceof AppError
    ? error
    : error instanceof SyntaxError && 'body' in error
      ? new AppError('INVALID_JSON', 400, 'Malformed JSON request body')
      : new AppError('INTERNAL_ERROR', 500, 'An unexpected error occurred');

  if (appError.statusCode >= 500) {
    request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
  }

  response.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
    },
    requestId: request.id,
  });
};
