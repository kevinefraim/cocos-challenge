import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/AppError.js';
import { createAppError } from '../errors/error-catalog.js';
import { HTTP_STATUS } from '../http/constants.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : error instanceof SyntaxError && 'body' in error
        ? createAppError('INVALID_JSON')
        : typeof error === 'object' && error !== null && 'status' in error && error.status === 413
          ? createAppError('PAYLOAD_TOO_LARGE')
          : createAppError('INTERNAL_ERROR');

  if (appError.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
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
