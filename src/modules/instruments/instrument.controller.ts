import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../shared/errors/AppError.js';
import { searchInstrumentsQuerySchema } from './instrument.schemas.js';
import type { InstrumentService } from './instrument.service.js';

export class InstrumentController {
  constructor(private readonly instrumentService: InstrumentService) {}

  search = async (request: Request, response: Response, next: NextFunction) => {
    const parsedQuery = searchInstrumentsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      next(new AppError('INVALID_QUERY', 400, 'Invalid instrument search query'));
      return;
    }

    try {
      response.status(200).json({
        ...(await this.instrumentService.search(parsedQuery.data)),
        requestId: request.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
