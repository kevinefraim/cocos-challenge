import type { Repository } from 'typeorm';

import { Instrument } from '../../database/entities/Instrument.js';
import type { SearchInstrumentsQuery } from './instrument.schemas.js';

export class InstrumentRepository {
  constructor(private readonly repository: Repository<Instrument>) {}

  async search({ q, page, pageSize }: SearchInstrumentsQuery) {
    const pattern = `%${q}%`;

    return this.repository
      .createQueryBuilder('instrument')
      .where('instrument.type <> :cashType', { cashType: 'MONEDA' })
      .andWhere('(instrument.ticker ILIKE :pattern OR instrument.name ILIKE :pattern)', { pattern })
      .orderBy('instrument.ticker', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
  }
}
