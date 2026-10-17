import type { SearchInstrumentsQuery } from './instrument.repository.js';
import type { InstrumentRepository } from './instrument.repository.js';

export class InstrumentService {
  constructor(private readonly instrumentRepository: InstrumentRepository) {}

  async search(query: SearchInstrumentsQuery) {
    const [instruments, total] = await this.instrumentRepository.search(query);

    return {
      data: instruments.map((instrument) => ({
        id: instrument.id,
        ticker: instrument.ticker,
        name: instrument.name,
        type: instrument.type,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }
}
