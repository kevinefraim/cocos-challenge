import { Decimal } from '../../shared/money/decimal.js';
import type { DataSource } from 'typeorm';

import type { Order } from '../../database/entities/Order.js';
import { createAppError } from '../../shared/errors/error-catalog.js';
import { HTTP_STATUS } from '../../shared/http/constants.js';
import { canCancelOrder, getInitialOrderStatus, type OrderStatus } from './order-state-machine.js';
import { MAX_ORDER_SIZE, type CreateOrderInput } from './order.schemas.js';
import type { OrderRepository } from './order.repository.js';

type CreateOrderResult = {
  order: ReturnType<OrderService['serializeOrder']>;
  rejectionReason?: 'INSUFFICIENT_CASH' | 'INSUFFICIENT_HOLDINGS';
};

export class OrderService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderRepository: OrderRepository,
  ) {}

  async create(userId: number, input: CreateOrderInput): Promise<CreateOrderResult> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.orderRepository.findUserForUpdate(manager, userId);

      if (!user) {
        throw createAppError('USER_NOT_FOUND');
      }

      const instrument = await this.orderRepository.findInstrument(manager, input.instrumentId);

      if (!instrument || instrument.type === 'MONEDA') {
        throw createAppError('INSTRUMENT_NOT_FOUND');
      }

      const effectivePrice =
        input.type === 'MARKET'
          ? this.getMarketPrice(
              await this.orderRepository.findLatestMarketData(manager, instrument.id),
            )
          : new Decimal(input.price!);
      const derivedQuantity =
        input.quantity === undefined
          ? new Decimal(input.amount!).div(effectivePrice).floor()
          : new Decimal(input.quantity);

      if (derivedQuantity.lessThan(1)) {
        throw createAppError('AMOUNT_TOO_LOW');
      }

      if (derivedQuantity.greaterThan(MAX_ORDER_SIZE)) {
        throw createAppError('QUANTITY_TOO_LARGE');
      }

      const quantity = derivedQuantity.toNumber();

      const filledOrders = await this.orderRepository.findFilledOrders(manager, user.id);
      const hasSufficientCash = this.calculateAvailableCash(filledOrders).greaterThanOrEqualTo(
        effectivePrice.mul(quantity),
      );
      const hasSufficientHoldings = this.calculateHolding(filledOrders, instrument.id) >= quantity;
      const hasSufficientBalance = input.side === 'BUY' ? hasSufficientCash : hasSufficientHoldings;
      const status = getInitialOrderStatus(input.type, hasSufficientBalance);

      const order = await this.orderRepository.create(manager, {
        instrumentId: instrument.id,
        userId: user.id,
        size: quantity,
        price: effectivePrice.toFixed(2),
        side: input.side,
        status,
        type: input.type,
        datetime: new Date(),
      });

      return {
        order: this.serializeOrder(order),
        rejectionReason:
          status === 'REJECTED'
            ? input.side === 'BUY'
              ? 'INSUFFICIENT_CASH'
              : 'INSUFFICIENT_HOLDINGS'
            : undefined,
      };
    });
  }

  async cancel(userId: number, orderId: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepository.findOrderForUpdate(manager, userId, orderId);

      if (!order) {
        throw createAppError('ORDER_NOT_FOUND');
      }

      if (!canCancelOrder(order.status as OrderStatus)) {
        throw createAppError('ORDER_NOT_CANCELLABLE');
      }

      order.status = 'CANCELLED';
      return this.serializeOrder(await this.orderRepository.save(manager, order));
    });
  }

  private calculateAvailableCash(orders: Order[]) {
    return orders.reduce((cash, order) => {
      if (order.side === 'CASH_IN') return cash.plus(order.size);
      if (order.side === 'CASH_OUT') return cash.minus(order.size);
      const notional = new Decimal(order.price!).mul(order.size);
      if (order.side === 'BUY') return cash.minus(notional);
      if (order.side === 'SELL') return cash.plus(notional);

      return cash;
    }, new Decimal(0));
  }

  private getMarketPrice(quote: { close: string | null } | null) {
    if (!quote || quote.close === null) {
      throw createAppError('MARKET_DATA_UNAVAILABLE', {
        statusCode: HTTP_STATUS.CONFLICT,
        message: 'No current market price is available for this instrument',
      });
    }

    const price = new Decimal(quote.close).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (!price.isFinite() || price.lessThanOrEqualTo(0)) {
      throw createAppError('MARKET_DATA_UNAVAILABLE', {
        statusCode: HTTP_STATUS.CONFLICT,
        message: 'The current market price is invalid for this instrument',
      });
    }

    return price;
  }

  private calculateHolding(orders: Order[], instrumentId: number) {
    return orders.reduce((holding, order) => {
      if (order.instrumentId !== instrumentId) return holding;
      if (order.side === 'BUY') return holding + order.size;
      if (order.side === 'SELL') return holding - order.size;
      return holding;
    }, 0);
  }

  private serializeOrder(order: Order) {
    return {
      id: order.id,
      userId: order.userId,
      instrumentId: order.instrumentId,
      side: order.side,
      type: order.type,
      status: order.status,
      quantity: order.size,
      price: order.price,
      datetime: order.datetime.toISOString(),
    };
  }
}
