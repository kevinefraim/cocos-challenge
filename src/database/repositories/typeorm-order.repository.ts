import type { DataSource, EntityManager } from 'typeorm';

import type { NewOrder, Order as DomainOrder } from '../../domain/models.js';
import type {
  OrderRepository,
  TransactionalOrderRepository,
} from '../../modules/orders/order.repository.js';
import { Instrument } from '../entities/Instrument.js';
import { MarketData } from '../entities/MarketData.js';
import { Order } from '../entities/Order.js';
import { User } from '../entities/User.js';
import { toInstrument, toMarketData, toOrder, toUser } from './mappers.js';

export class TypeOrmOrderRepository implements OrderRepository {
  constructor(private readonly dataSource: DataSource) {}

  withTransaction<T>(work: (repository: TransactionalOrderRepository) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmTransactionalOrderRepository(manager)),
    );
  }
}

class TypeOrmTransactionalOrderRepository implements TransactionalOrderRepository {
  constructor(private readonly manager: EntityManager) {}

  async findUserForUpdate(userId: number) {
    const user = await this.manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    return user ? toUser(user) : null;
  }

  async findInstrument(instrumentId: number) {
    const instrument = await this.manager.getRepository(Instrument).findOneBy({ id: instrumentId });
    return instrument ? toInstrument(instrument) : null;
  }

  async findLatestMarketData(instrumentId: number) {
    const quote = await this.manager.getRepository(MarketData).findOne({
      where: { instrumentId },
      order: { date: 'DESC', id: 'DESC' },
    });
    return quote ? toMarketData(quote) : null;
  }

  async findFilledOrders(userId: number) {
    const orders = await this.manager
      .getRepository(Order)
      .find({ where: { userId, status: 'FILLED' } });
    return orders.map(toOrder);
  }

  async create(order: NewOrder) {
    const repository = this.manager.getRepository(Order);
    return toOrder(await repository.save(repository.create(order)));
  }

  async findOrderForUpdate(userId: number, orderId: number) {
    const order = await this.manager.getRepository(Order).findOne({
      where: { id: orderId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    return order ? toOrder(order) : null;
  }

  async save(order: DomainOrder) {
    return toOrder(await this.manager.getRepository(Order).save(toOrder(order)));
  }
}
