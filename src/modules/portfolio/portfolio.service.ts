import { Decimal } from 'decimal.js';

import { AppError } from '../../shared/errors/AppError.js';
import { PortfolioRepository } from './portfolio.repository.js';

type Position = {
  instrumentId: number;
  ticker: string;
  name: string;
  quantity: number;
  averageCost: Decimal;
};

const decimalToMoney = (value: Decimal) => value.toFixed(2);
const decimalToPercent = (value: Decimal) => value.toFixed(2);

export class PortfolioService {
  constructor(private readonly portfolioRepository: PortfolioRepository) {}

  async getPortfolio(userId: number) {
    const user = await this.portfolioRepository.findUser(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found');
    }

    const orders = await this.portfolioRepository.findFilledOrders(userId);
    const positions = new Map<number, Position>();
    let availableCash = new Decimal(0);

    for (const order of orders) {
      const price = new Decimal(order.price);
      const notional = price.mul(order.size);

      if (order.side === 'CASH_IN') {
        availableCash = availableCash.plus(order.size);
        continue;
      }

      if (order.side === 'CASH_OUT') {
        availableCash = availableCash.minus(order.size);
        continue;
      }

      if (order.instrument.type === 'MONEDA') {
        continue;
      }

      const position = positions.get(order.instrumentId) ?? {
        instrumentId: order.instrumentId,
        ticker: order.instrument.ticker,
        name: order.instrument.name,
        quantity: 0,
        averageCost: new Decimal(0),
      };

      if (order.side === 'BUY') {
        const totalCost = position.averageCost.mul(position.quantity).plus(notional);
        position.quantity += order.size;
        position.averageCost = totalCost.div(position.quantity);
        availableCash = availableCash.minus(notional);
        positions.set(order.instrumentId, position);
        continue;
      }

      if (order.side === 'SELL') {
        position.quantity -= order.size;
        availableCash = availableCash.plus(notional);

        if (position.quantity === 0) {
          positions.delete(order.instrumentId);
        } else {
          positions.set(order.instrumentId, position);
        }
      }
    }

    const marketData = await this.portfolioRepository.findLatestMarketData([...positions.keys()]);
    const marketDataByInstrumentId = new Map(marketData.map((quote) => [quote.instrumentId, quote]));
    let positionsMarketValue = new Decimal(0);

    const responsePositions = [...positions.values()].map((position) => {
      const quote = marketDataByInstrumentId.get(position.instrumentId);

      if (!quote) {
        throw new AppError('MARKET_DATA_NOT_FOUND', 500, `Missing market data for ${position.ticker}`);
      }

      const lastPrice = new Decimal(quote.close);
      const previousClose = new Decimal(quote.previousClose);
      const marketValue = lastPrice.mul(position.quantity);
      positionsMarketValue = positionsMarketValue.plus(marketValue);

      return {
        instrumentId: position.instrumentId,
        ticker: position.ticker,
        name: position.name,
        quantity: position.quantity,
        averageCost: decimalToMoney(position.averageCost),
        lastPrice: decimalToMoney(lastPrice),
        marketValue: decimalToMoney(marketValue),
        unrealizedReturnPercent: decimalToPercent(lastPrice.minus(position.averageCost).div(position.averageCost).mul(100)),
        dailyReturnPercent: previousClose.isZero()
          ? null
          : decimalToPercent(lastPrice.minus(previousClose).div(previousClose).mul(100)),
      };
    });

    return {
      userId: user.id,
      currency: 'ARS',
      availableCash: decimalToMoney(availableCash),
      accountTotal: decimalToMoney(availableCash.plus(positionsMarketValue)),
      positions: responsePositions,
    };
  }
}
