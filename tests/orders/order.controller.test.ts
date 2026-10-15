import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { OrderController } from '../../src/modules/orders/order.controller.js';

describe('OrderController', () => {
  it('does not emit an order committed event when the transaction fails', async () => {
    const error = new Error('transaction rolled back');
    const info = vi.fn();
    const next = vi.fn();
    const controller = new OrderController({
      create: async () => {
        throw error;
      },
    } as never);
    await controller.create(
      {
        id: 'request-1',
        log: { info },
        params: { userId: '1' },
        body: { instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 1 },
      } as unknown as Request,
      {} as Response,
      next,
    );
    expect(info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });
  it('records safe domain identifiers and rejection reason after creation succeeds', async () => {
    const result = { order: { id: 5, status: 'REJECTED' }, rejectionReason: 'INSUFFICIENT_CASH' };
    const info = vi.fn();
    const controller = new OrderController({ create: async () => result } as never);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    await controller.create(
      {
        id: 'request-1',
        log: { info },
        params: { userId: '1' },
        body: { instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 1 },
      } as unknown as Request,
      response,
      vi.fn(),
    );
    expect(info).toHaveBeenCalledWith(
      {
        event: 'order.created',
        requestId: 'request-1',
        userId: 1,
        orderId: 5,
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_CASH',
      },
      'Order committed',
    );
  });
  it('identifies an invalid user separately when cancelling', async () => {
    const next = vi.fn();
    const controller = new OrderController({} as never);

    await controller.cancel(
      { params: { userId: '0', orderId: '1' } } as unknown as Request,
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_USER_ID', statusCode: 400 }),
    );
  });

  it('identifies an invalid order separately when cancelling', async () => {
    const next = vi.fn();
    const controller = new OrderController({} as never);

    await controller.cancel(
      { params: { userId: '1', orderId: '0' } } as unknown as Request,
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_ORDER_ID', statusCode: 400 }),
    );
  });
});
