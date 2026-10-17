import type { Instrument } from '../../domain/models.js';

export type SearchInstrumentsQuery = { q: string; page: number; pageSize: number };

export interface InstrumentRepository {
  /** Excluye monedas; orden estable por ticker e id, total previo a paginación. */
  search(query: SearchInstrumentsQuery): Promise<[Instrument[], number]>;
}
