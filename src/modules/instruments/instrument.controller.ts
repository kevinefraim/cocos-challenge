import type { NextFunction, Request, Response } from 'express';

import { createAppError } from '../../shared/errors/error-catalog.js';
import { HTTP_STATUS } from '../../shared/http/constants.js';
import { searchInstrumentsQuerySchema } from './instrument.schemas.js';
import type { InstrumentService } from './instrument.service.js';

export class InstrumentController {
  constructor(private readonly instrumentService: InstrumentService) {}

  search = async (request: Request, response: Response, next: NextFunction) => {
    const parsedQuery = searchInstrumentsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      next(createAppError('INVALID_QUERY'));
      return;
    }

    try {
      response.status(HTTP_STATUS.OK).json({
        ...(await this.instrumentService.search(parsedQuery.data)),
        requestId: request.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
