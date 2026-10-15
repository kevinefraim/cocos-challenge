import { describe, it, expect } from 'vitest';
import { createOrderBodySchema } from '../src/modules/orders/order.schemas.js';
import { contractFor } from './contract.js';

describe('OpenAPI request contract', () => {
  it('agrees with runtime validation on sizing, order type, IDs and numeric limits', () => {
    const validate = contractFor('CreateOrder');
    for (const type of ['MARKET', 'LIMIT'])
      for (const sizing of [
        {},
        { quantity: 1 },
        { amount: '10.00' },
        { quantity: 1, amount: '10.00' },
        { quantity: 2147483648 },
        { quantity: 0 },
        { amount: '0.00' },
        { amount: '1.001' },
      ])
        for (const price of [
          undefined,
          '10.00',
          '99999999.99',
          '100000000.00',
          '0.00',
          '00010.00',
        ]) {
          const input = {
            instrumentId: 1,
            side: 'BUY',
            type,
            ...sizing,
            ...(price === undefined ? {} : { price }),
          };
          expect(validate(input), JSON.stringify(input)).toBe(
            createOrderBodySchema.safeParse(input).success,
          );
        }
    for (const instrumentId of [0, -1, 2147483647, 2147483648, 9007199254740992]) {
      const input = { instrumentId, side: 'SELL', type: 'MARKET', quantity: 1 };
      expect(validate(input)).toBe(createOrderBodySchema.safeParse(input).success);
    }
  });
});
