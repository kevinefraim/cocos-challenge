import { z } from 'zod';

export const searchInstrumentsQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchInstrumentsQuery = z.infer<typeof searchInstrumentsQuerySchema>;
