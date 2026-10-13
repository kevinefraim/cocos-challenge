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
        availableCash = availableCash.minus(notional);

        if (position.quantity < 0) {
          const nextQuantity = position.quantity + order.size;

          if (nextQuantity === 0) {
            positions.delete(order.instrumentId);
          } else if (nextQuantity > 0) {
            position.quantity = nextQuantity;
            position.averageCost = price;
            positions.set(order.instrumentId, position);
          } else {
            position.quantity = nextQuantity;
            positions.set(order.instrumentId, position);
          }
        } else {
          const totalCost = position.averageCost.mul(position.quantity).plus(notional);
          position.quantity += order.size;
          position.averageCost = totalCost.div(position.quantity);
          positions.set(order.instrumentId, position);
        }

        continue;
      }

      if (order.side === 'SELL') {
        availableCash = availableCash.plus(notional);
        const nextQuantity = position.quantity - order.size;

        if (nextQuantity === 0) {
          positions.delete(order.instrumentId);
        } else if (position.quantity > 0 && nextQuantity < 0) {
          position.quantity = nextQuantity;
          position.averageCost = price;
          positions.set(order.instrumentId, position);
        } else if (position.quantity <= 0) {
          const totalShortCost = position.averageCost.mul(Math.abs(position.quantity)).plus(notional);
          position.quantity = nextQuantity;
          position.averageCost = totalShortCost.div(Math.abs(nextQuantity));
          positions.set(order.instrumentId, position);
        } else {
          position.quantity = nextQuantity;
          positions.set(order.instrumentId, position);
        }

        continue;
      }

      throw new AppError('INVALID_ORDER_HISTORY', 500, `Unsupported order side ${order.side}`);
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

      if (position.averageCost.lessThanOrEqualTo(0)) {
        throw new AppError('INVALID_ORDER_HISTORY', 500, `Invalid cost basis for ${position.ticker}`);
      }
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
        unrealizedReturnPercent: decimalToPercent(
          (position.quantity > 0 ? lastPrice.minus(position.averageCost) : position.averageCost.minus(lastPrice))
            .div(position.averageCost)
            .mul(100),
        ),
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
