import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../../shared/errors/AppError.js';
import { PortfolioService } from './portfolio.service.js';

const userParamsSchema = z.object({ userId: z.coerce.number().int().positive() });

export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  getPortfolio = async (request: Request, response: Response, next: NextFunction) => {
    const parsedParams = userParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(new AppError('INVALID_USER_ID', 400, 'User ID must be a positive integer'));
      return;
    }

    try {
      response.status(200).json(await this.portfolioService.getPortfolio(parsedParams.data.userId));
    } catch (error) {
      next(error);
    }
  };
}
