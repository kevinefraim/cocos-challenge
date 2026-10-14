import type { NextFunction, Request, Response } from 'express';

import { createAppError } from '../../shared/errors/error-catalog.js';
import { HTTP_STATUS } from '../../shared/http/constants.js';
import {
  cancelOrderParamsSchema,
  createOrderBodySchema,
  userOrderParamsSchema,
} from './order.schemas.js';
import type { OrderService } from './order.service.js';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  create = async (request: Request, response: Response, next: NextFunction) => {
    const params = userOrderParamsSchema.safeParse(request.params);
    const body = createOrderBodySchema.safeParse(request.body);

    if (!params.success) {
      next(createAppError('INVALID_USER_ID'));
      return;
    }

    if (!body.success) {
      next(createAppError('INVALID_ORDER'));
      return;
    }

    try {
      response.status(HTTP_STATUS.CREATED).json({
        ...(await this.orderService.create(params.data.userId, body.data)),
        requestId: request.id,
      });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (request: Request, response: Response, next: NextFunction) => {
    const userParams = userOrderParamsSchema.safeParse(request.params);
    if (!userParams.success) {
      next(createAppError('INVALID_USER_ID'));
      return;
    }

    const params = cancelOrderParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(createAppError('INVALID_ORDER_ID'));
      return;
    }

    try {
      response.status(HTTP_STATUS.OK).json({
        ...(await this.orderService.cancel(params.data.userId, params.data.orderId)),
        requestId: request.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
