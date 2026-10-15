import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../src/shared/middleware/error-handler.js';

describe('errorHandler', () => {
  it.each([
    [{ type: 'request.aborted' }, 400, 'INVALID_REQUEST_BODY'],
    [{ type: 'request.size.invalid' }, 400, 'INVALID_REQUEST_BODY'],
    [{ type: 'charset.unsupported' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [{ type: 'encoding.unsupported' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [{ driverError: { code: '08006' } }, 503, 'DATABASE_UNAVAILABLE'],
    [{ code: '57P01' }, 503, 'DATABASE_UNAVAILABLE'],
    [new Error('Connection terminated unexpectedly'), 503, 'DATABASE_UNAVAILABLE'],
    [{ code: '22003' }, 500, 'INTERNAL_ERROR'],
    [null, 500, 'INTERNAL_ERROR'],
    [new Error('Unexpected programming error'), 500, 'INTERNAL_ERROR'],
  ])('classifies known transport and connectivity errors (%j)', (error, statusCode, code) => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    errorHandler(
      error,
      { id: '1', log: { error: vi.fn() } } as unknown as Request,
      { status, json } as unknown as Response,
      vi.fn(),
    );
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code }) }),
    );
  });

  it('delegates errors after headers have already been sent', () => {
    const next = vi.fn();
    const error = new Error('stream failure');
    errorHandler(error, {} as Request, { headersSent: true } as Response, next);
    expect(next).toHaveBeenCalledWith(error);
  });
  it('preserves an Express payload-too-large response as 413', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = { status, json } as unknown as Response;
    const request = {
      id: 'request-1',
      log: { error: vi.fn() },
    } as unknown as Request;

    errorHandler({ status: 413 }, request, response, vi.fn());

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the allowed size' },
      requestId: 'request-1',
    });
  });
});
