import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  RENDER_GIT_COMMIT: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export const env = environmentSchema.parse(process.env);
