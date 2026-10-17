import { Router } from 'express';
import { PortfolioController } from './portfolio.controller.js';
import type { PortfolioRepository } from './portfolio.repository.js';
import { PortfolioService } from './portfolio.service.js';

export function createPortfolioRouter(repository: PortfolioRepository) {
  const router = Router();
  const service = new PortfolioService(repository);
  const controller = new PortfolioController(service);

  router.get('/:userId/portfolio', controller.getPortfolio);

  return router;
}
