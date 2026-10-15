import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/AppError.js';
import { createAppError } from '../errors/error-catalog.js';
import { HTTP_STATUS } from '../http/constants.js';

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01',
  '57P02',
  '57P03',
]);

function classifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof SyntaxError && 'body' in error) return createAppError('INVALID_JSON');
  if (typeof error !== 'object' || error === null) return createAppError('INTERNAL_ERROR');
  if ('status' in error && error.status === 413) return createAppError('PAYLOAD_TOO_LARGE');
  if (
    'type' in error &&
    (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported')
  )
    return createAppError('UNSUPPORTED_MEDIA_TYPE');
  if (
    'type' in error &&
    (error.type === 'request.aborted' || error.type === 'request.size.invalid')
  )
    return createAppError('INVALID_REQUEST_BODY');
  const driverError = 'driverError' in error ? error.driverError : error;
  if (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    typeof driverError.code === 'string' &&
    (CONNECTION_CODES.has(driverError.code) || driverError.code.startsWith('08'))
  )
    return createAppError('DATABASE_UNAVAILABLE');
  // pg also emits un-coded errors when an established connection is closed.
  if (
    error instanceof Error &&
    [
      'Connection terminated unexpectedly',
      'Connection terminated',
      'Connection ended unexpectedly',
      'timeout exceeded when trying to connect',
    ].includes(error.message)
  )
    return createAppError('DATABASE_UNAVAILABLE');
  return createAppError('INTERNAL_ERROR');
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (response.headersSent) {
    _next(error);
    return;
  }
  const appError = classifyError(error);

  if (appError.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    request.log.error({ code: appError.code, requestId: request.id }, 'Request failed');
  }

  response.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
    },
    requestId: request.id,
  });
};
