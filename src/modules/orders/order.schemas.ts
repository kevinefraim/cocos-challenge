import { Decimal } from '../../shared/money/decimal.js';
import { z } from 'zod';
import {
  identifierSchema,
  MAX_DATABASE_INTEGER,
  userParamsSchema,
} from '../../shared/validation/identifiers.js';

export const MAX_ORDER_SIZE = MAX_DATABASE_INTEGER;
const MAX_PERSISTED_PRICE = new Decimal('99999999.99');

const positiveMoney = z
  .string()
  .max(20, 'Must not exceed 20 characters')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal value with at most two decimal places')
  .refine((value) => new Decimal(value).greaterThan(0), 'Must be greater than zero');

const persistedPrice = positiveMoney.refine(
  (value) => new Decimal(value).lessThanOrEqualTo(MAX_PERSISTED_PRICE),
  'Exceeds the database price limit',
);

export const userOrderParamsSchema = userParamsSchema;

export const cancelOrderParamsSchema = userOrderParamsSchema.extend({
  orderId: z.coerce.number().pipe(identifierSchema),
});

export const createOrderBodySchema = z
  .object({
    instrumentId: identifierSchema,
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    quantity: z.number().int().positive().max(MAX_ORDER_SIZE).optional(),
    amount: positiveMoney.optional(),
    price: persistedPrice.optional(),
  })
  .superRefine((value, context) => {
    if ((value.quantity === undefined) === (value.amount === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of quantity or amount',
        path: ['quantity'],
      });
    }

    if (value.type === 'LIMIT' && value.price === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Limit orders require a price',
        path: ['price'],
      });
    }

    if (value.type === 'MARKET' && value.price !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Market orders must not include a price',
        path: ['price'],
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
