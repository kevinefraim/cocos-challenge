import { Router } from 'express';
import type { DataSource } from 'typeorm';

import { PortfolioController } from './portfolio.controller.js';
import { PortfolioRepository } from './portfolio.repository.js';
import { PortfolioService } from './portfolio.service.js';

export function createPortfolioRouter(dataSource: DataSource) {
  const router = Router();
  const repository = new PortfolioRepository(dataSource);
  const service = new PortfolioService(repository);
  const controller = new PortfolioController(service);

  router.get('/:userId/portfolio', controller.getPortfolio);

  return router;
}
