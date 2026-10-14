import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { OrderController } from '../../src/modules/orders/order.controller.js';

describe('OrderController', () => {
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
