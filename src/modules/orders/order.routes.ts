import { Router } from 'express';
import { OrderController } from './order.controller.js';
import type { OrderRepository } from './order.repository.js';
import { OrderService } from './order.service.js';

export function createOrderRouter(repository: OrderRepository) {
  const router = Router();
  const service = new OrderService(repository);
  const controller = new OrderController(service);

  router.post('/:userId/orders', controller.create);
  router.patch('/:userId/orders/:orderId/cancel', controller.cancel);

  return router;
}
