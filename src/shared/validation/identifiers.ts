import { z } from 'zod';

export const MAX_DATABASE_INTEGER = 2_147_483_647;
export const identifierSchema = z.number().int().positive().max(MAX_DATABASE_INTEGER);
export const userParamsSchema = z.object({ userId: z.coerce.number().pipe(identifierSchema) });
