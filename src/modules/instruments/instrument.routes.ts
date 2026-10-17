import { Router } from 'express';
import { InstrumentController } from './instrument.controller.js';
import type { InstrumentRepository } from './instrument.repository.js';
import { InstrumentService } from './instrument.service.js';

export function createInstrumentRouter(repository: InstrumentRepository) {
  const router = Router();
  const service = new InstrumentService(repository);
  const controller = new InstrumentController(service);

  router.get('/', controller.search);

  return router;
}
