import { ILike, Not, type Repository } from 'typeorm';

import type { Instrument } from '../entities/Instrument.js';
import type {
  InstrumentRepository,
  SearchInstrumentsQuery,
} from '../../modules/instruments/instrument.repository.js';
import type { Instrument as DomainInstrument } from '../../domain/models.js';
import { toInstrument } from './mappers.js';

export class TypeOrmInstrumentRepository implements InstrumentRepository {
  constructor(private readonly repository: Repository<Instrument>) {}

  async search({
    q,
    page,
    pageSize,
  }: SearchInstrumentsQuery): Promise<[DomainInstrument[], number]> {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    const [instruments, total] = await this.repository.findAndCount({
      where: [
        { type: Not('MONEDA'), ticker: ILike(pattern) },
        { type: Not('MONEDA'), name: ILike(pattern) },
      ],
      order: { ticker: 'ASC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return [instruments.map(toInstrument), total];
  }
}
