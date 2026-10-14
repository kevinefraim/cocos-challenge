import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { createAppError } from '../../shared/errors/error-catalog.js';
import { HTTP_STATUS } from '../../shared/http/constants.js';
import type { PortfolioService } from './portfolio.service.js';

const userParamsSchema = z.object({ userId: z.coerce.number().int().positive() });

export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  getPortfolio = async (request: Request, response: Response, next: NextFunction) => {
    const parsedParams = userParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(createAppError('INVALID_USER_ID'));
      return;
    }

    try {
      response.status(HTTP_STATUS.OK).json({
        ...(await this.portfolioService.getPortfolio(parsedParams.data.userId)),
        requestId: request.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
