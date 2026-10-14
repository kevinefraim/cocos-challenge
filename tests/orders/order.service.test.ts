import { describe, expect, it } from 'vitest';

import type { Instrument } from '../../src/database/entities/Instrument.js';
import type { Order } from '../../src/database/entities/Order.js';
import type { User } from '../../src/database/entities/User.js';
import type { OrderRepository } from '../../src/modules/orders/order.repository.js';
import { OrderService } from '../../src/modules/orders/order.service.js';

const user = { id: 7 } as User;
const instrument = { id: 10, type: 'ACCIONES' } as Instrument;

function serviceFor(options: { close: string | null; filledOrders?: Order[] }) {
  let nextOrderId = 1;
  const repository = {
    findUserForUpdate: async () => user,
    findInstrument: async () => instrument,
    findLatestMarketData: async () =>
      options.close === null ? null : { instrumentId: instrument.id, close: options.close },
    findFilledOrders: async () => options.filledOrders ?? [],
    create: async (_manager: unknown, order: Record<string, unknown>) => ({
      ...order,
      id: nextOrderId++,
    }),
  } as unknown as OrderRepository;
  const dataSource = {
    transaction: async (callback: (manager: unknown) => unknown) => callback({}),
  };

  return new OrderService(dataSource as never, repository);
}

const cashIn = (amount: number) =>
  ({
    id: 1,
    instrumentId: 66,
    userId: user.id,
    size: amount,
    price: '1.00',
    side: 'CASH_IN',
    status: 'FILLED',
    type: 'MARKET',
    datetime: new Date(),
  }) as Order;

describe('OrderService', () => {
  it('creates a limit order without requiring market data', async () => {
    const result = await serviceFor({ close: null, filledOrders: [cashIn(10)] }).create(user.id, {
      instrumentId: instrument.id,
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: '10.00',
    });

    expect(result.order).toMatchObject({ status: 'NEW', price: '10.00' });
  });

  it('uses the rounded persisted market price for amount conversion and balance validation', async () => {
    const result = await serviceFor({ close: '10.005', filledOrders: [cashIn(90)] }).create(
      user.id,
      {
        instrumentId: instrument.id,
        side: 'BUY',
        type: 'MARKET',
        amount: '100.00',
      },
    );

    expect(result.order).toMatchObject({ quantity: 9, price: '10.01', status: 'REJECTED' });
    expect(result.rejectionReason).toBe('INSUFFICIENT_CASH');
  });

  it('rejects an invalid market price as a controlled domain error', async () => {
    await expect(
      serviceFor({ close: '0' }).create(user.id, {
        instrumentId: instrument.id,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'MARKET_DATA_UNAVAILABLE', statusCode: 409 });
  });

  it('returns a controlled error when a market order has no quote', async () => {
    await expect(
      serviceFor({ close: null }).create(user.id, {
        instrumentId: instrument.id,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'MARKET_DATA_UNAVAILABLE', statusCode: 409 });
  });
});
