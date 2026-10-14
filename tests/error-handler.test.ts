import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../src/shared/middleware/error-handler.js';

describe('errorHandler', () => {
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
