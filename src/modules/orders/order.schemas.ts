import { Decimal } from 'decimal.js';
import { z } from 'zod';

const positiveMoney = z.string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal value with at most two decimal places')
  .refine((value) => new Decimal(value).greaterThan(0), 'Must be greater than zero');

export const userOrderParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const cancelOrderParamsSchema = userOrderParamsSchema.extend({
  orderId: z.coerce.number().int().positive(),
});

export const createOrderBodySchema = z.object({
  instrumentId: z.number().int().positive(),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  quantity: z.number().int().positive().optional(),
  amount: positiveMoney.optional(),
  price: positiveMoney.optional(),
}).superRefine((value, context) => {
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
