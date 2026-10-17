import { z } from 'zod';

export const searchInstrumentsQuerySchema = z.object({
  q: z.string().trim().min(2).max(50),
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type { SearchInstrumentsQuery } from './instrument.repository.js';
