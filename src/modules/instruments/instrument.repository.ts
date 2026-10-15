import { ILike, Not, type Repository } from 'typeorm';

import type { Instrument } from '../../database/entities/Instrument.js';
import type { SearchInstrumentsQuery } from './instrument.schemas.js';

export class InstrumentRepository {
  constructor(private readonly repository: Repository<Instrument>) {}

  async search({ q, page, pageSize }: SearchInstrumentsQuery) {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    return this.repository.findAndCount({
      where: [
        { type: Not('MONEDA'), ticker: ILike(pattern) },
        { type: Not('MONEDA'), name: ILike(pattern) },
      ],
      order: { ticker: 'ASC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }
}
