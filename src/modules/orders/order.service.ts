import { Decimal } from 'decimal.js';
import type { DataSource } from 'typeorm';

import type { Order } from '../../database/entities/Order.js';
import { AppError } from '../../shared/errors/AppError.js';
import { canCancelOrder, getInitialOrderStatus, type OrderStatus } from './order-state-machine.js';
import type { CreateOrderInput } from './order.schemas.js';
import { OrderRepository } from './order.repository.js';

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
        throw new AppError('USER_NOT_FOUND', 404, 'User not found');
      }

      const instrument = await this.orderRepository.findInstrument(manager, input.instrumentId);

      if (!instrument || instrument.type === 'MONEDA') {
        throw new AppError('INSTRUMENT_NOT_FOUND', 404, 'Tradable instrument not found');
      }

      const quote = await this.orderRepository.findLatestMarketData(manager, instrument.id);

      if (!quote) {
        throw new AppError('MARKET_DATA_NOT_FOUND', 409, 'No current market price is available for this instrument');
      }

      const effectivePrice = input.type === 'MARKET' ? new Decimal(quote.close) : new Decimal(input.price!);
      const quantity = input.quantity ?? new Decimal(input.amount!).div(effectivePrice).floor().toNumber();

      if (quantity < 1) {
        throw new AppError('AMOUNT_TOO_LOW', 400, 'Amount is too low to purchase one share');
      }

      const filledOrders = await this.orderRepository.findFilledOrders(manager, user.id);
      const hasSufficientCash = this.calculateAvailableCash(filledOrders).greaterThanOrEqualTo(effectivePrice.mul(quantity));
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
        rejectionReason: status === 'REJECTED'
          ? input.side === 'BUY' ? 'INSUFFICIENT_CASH' : 'INSUFFICIENT_HOLDINGS'
          : undefined,
      };
    });
  }

  async cancel(userId: number, orderId: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepository.findOrderForUpdate(manager, userId, orderId);

      if (!order) {
        throw new AppError('ORDER_NOT_FOUND', 404, 'Order not found');
      }

      if (!canCancelOrder(order.status as OrderStatus)) {
        throw new AppError('ORDER_NOT_CANCELLABLE', 409, 'Only NEW orders can be cancelled');
      }

      order.status = 'CANCELLED';
      return this.serializeOrder(await this.orderRepository.save(manager, order));
    });
  }

  private calculateAvailableCash(orders: Order[]) {
    return orders.reduce((cash, order) => {
      const notional = new Decimal(order.price).mul(order.size);

      if (order.side === 'CASH_IN') return cash.plus(order.size);
      if (order.side === 'CASH_OUT') return cash.minus(order.size);
      if (order.side === 'BUY') return cash.minus(notional);
      if (order.side === 'SELL') return cash.plus(notional);

      return cash;
    }, new Decimal(0));
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
