import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../shared/errors/AppError.js';
import { cancelOrderParamsSchema, createOrderBodySchema, userOrderParamsSchema } from './order.schemas.js';
import { OrderService } from './order.service.js';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  create = async (request: Request, response: Response, next: NextFunction) => {
    const params = userOrderParamsSchema.safeParse(request.params);
    const body = createOrderBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      next(new AppError('INVALID_ORDER', 400, 'Invalid order payload'));
      return;
    }

    try {
      response.status(201).json(await this.orderService.create(params.data.userId, body.data));
    } catch (error) {
      next(error);
    }
  };

  cancel = async (request: Request, response: Response, next: NextFunction) => {
    const params = cancelOrderParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(new AppError('INVALID_ORDER_ID', 400, 'Order ID must be a positive integer'));
      return;
    }

    try {
      response.status(200).json(await this.orderService.cancel(params.data.userId, params.data.orderId));
    } catch (error) {
      next(error);
    }
  };
}
