import { describe, expect, it } from 'vitest';

import type { Instrument } from '../../src/database/entities/Instrument.js';
import type { MarketData } from '../../src/database/entities/MarketData.js';
import type { Order } from '../../src/database/entities/Order.js';
import type { User } from '../../src/database/entities/User.js';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service.js';
import type { PortfolioRepository } from '../../src/modules/portfolio/portfolio.repository.js';

const user = { id: 7, email: 'investor@example.com', accountNumber: 'ACC-7' } as User;

const instrument = (id: number, type = 'ACCION') =>
  ({ id, ticker: `TICK${id}`, name: `Instrument ${id}`, type }) as Instrument;

const order = (
  id: number,
  side: string,
  size: number,
  price: string | null,
  security = instrument(10),
) =>
  ({
    id,
    userId: user.id,
    instrumentId: security.id,
    side,
    size,
    price,
    status: 'FILLED',
    type: 'MARKET',
    datetime: new Date(`2026-01-${String(id).padStart(2, '0')}T00:00:00.000Z`),
    instrument: security,
  }) as Order;

function serviceFor(orders: Order[], quotes: MarketData[], existingUser: User | null = user) {
  const repository = {
    findUser: async () => existingUser,
    findFilledOrders: async () => orders,
    findLatestMarketData: async () => quotes,
  } as unknown as PortfolioRepository;

  return new PortfolioService(repository);
}

describe('PortfolioService', () => {
  it('processes nullable cash prices from historical data', async () => {
    const result = await serviceFor(
      [order(1, 'CASH_IN', 100, null), order(2, 'CASH_OUT', 10, null)],
      [],
    ).getPortfolio(user.id);
    expect(result).toMatchObject({ availableCash: '90.00', accountTotal: '90.00', positions: [] });
  });
  it('rejects a portfolio request for an absent user', async () => {
    await expect(serviceFor([], [], null).getPortfolio(user.id)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('calculates cash, a long position, and a zero daily return denominator', async () => {
    const cash = instrument(1, 'MONEDA');
    const quote = { instrumentId: 10, close: '150', previousClose: '0' } as MarketData;
    const result = await serviceFor(
      [
        order(1, 'CASH_IN', 1000, '1', cash),
        order(2, 'CASH_OUT', 100, '1', cash),
        order(3, 'BUY', 2, '100'),
        order(4, 'BUY', 1, '200'),
        order(5, 'SELL', 1, '150'),
        order(6, 'BUY', 1, '1', cash),
      ],
      [quote],
    ).getPortfolio(user.id);

    expect(result).toMatchObject({
      availableCash: '650.00',
      accountTotal: '950.00',
      positions: [
        {
          instrumentId: 10,
          quantity: 2,
          averageCost: '133.33',
          marketValue: '300.00',
          dailyReturnPercent: null,
        },
      ],
    });
  });

  it('rebuilds historical short positions when trades cross through zero', async () => {
    const quote = { instrumentId: 10, close: '90', previousClose: '80' } as MarketData;
    const result = await serviceFor(
      [order(1, 'BUY', 1, '50'), order(2, 'SELL', 2, '100'), order(3, 'BUY', 2, '80')],
      [quote],
    ).getPortfolio(user.id);

    expect(result.positions).toEqual([
      expect.objectContaining({
        quantity: 1,
        averageCost: '80.00',
        unrealizedReturnPercent: '12.50',
        dailyReturnPercent: '12.50',
      }),
    ]);
  });

  it('returns a controlled service error when an open position lacks market data', async () => {
    await expect(
      serviceFor([order(1, 'BUY', 1, '100')], []).getPortfolio(user.id),
    ).rejects.toMatchObject({
      code: 'MARKET_DATA_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('returns a controlled service error for invalid quote values', async () => {
    await expect(
      serviceFor(
        [order(1, 'BUY', 1, '100')],
        [{ instrumentId: 10, close: null, previousClose: '90' } as MarketData],
      ).getPortfolio(user.id),
    ).rejects.toMatchObject({
      code: 'MARKET_DATA_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('returns a controlled service error for a negative or missing previous close', async () => {
    await expect(
      serviceFor(
        [order(1, 'BUY', 1, '100')],
        [{ instrumentId: 10, close: '-1', previousClose: '90' } as MarketData],
      ).getPortfolio(user.id),
    ).rejects.toMatchObject({ code: 'MARKET_DATA_UNAVAILABLE', statusCode: 503 });

    await expect(
      serviceFor(
        [order(1, 'BUY', 1, '100')],
        [{ instrumentId: 10, close: '100', previousClose: null } as MarketData],
      ).getPortfolio(user.id),
    ).rejects.toMatchObject({ code: 'MARKET_DATA_UNAVAILABLE', statusCode: 503 });
  });
});
