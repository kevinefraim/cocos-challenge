import { Router } from 'express';
import type { DataSource } from 'typeorm';

import { Instrument } from '../../database/entities/Instrument.js';
import { InstrumentController } from './instrument.controller.js';
import { InstrumentRepository } from './instrument.repository.js';
import { InstrumentService } from './instrument.service.js';

export function createInstrumentRouter(dataSource: DataSource) {
  const router = Router();
  const repository = new InstrumentRepository(dataSource.getRepository(Instrument));
  const service = new InstrumentService(repository);
  const controller = new InstrumentController(service);

  router.get('/', controller.search);

  return router;
}
