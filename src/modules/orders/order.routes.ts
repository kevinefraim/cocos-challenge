import { Router } from 'express';
import type { DataSource } from 'typeorm';

import { OrderController } from './order.controller.js';
import { OrderRepository } from './order.repository.js';
import { OrderService } from './order.service.js';

export function createOrderRouter(dataSource: DataSource) {
  const router = Router();
  const repository = new OrderRepository();
  const service = new OrderService(dataSource, repository);
  const controller = new OrderController(service);

  router.post('/:userId/orders', controller.create);
  router.patch('/:userId/orders/:orderId/cancel', controller.cancel);

  return router;
}
