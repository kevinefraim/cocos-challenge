import type { EntityManager } from 'typeorm';

import { Instrument } from '../../database/entities/Instrument.js';
import { MarketData } from '../../database/entities/MarketData.js';
import { Order } from '../../database/entities/Order.js';
import { User } from '../../database/entities/User.js';

export class OrderRepository {
  findUserForUpdate(manager: EntityManager, userId: number) {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  findInstrument(manager: EntityManager, instrumentId: number) {
    return manager.getRepository(Instrument).findOneBy({ id: instrumentId });
  }

  findLatestMarketData(manager: EntityManager, instrumentId: number) {
    return manager.getRepository(MarketData).findOne({
      where: { instrumentId },
      order: { date: 'DESC', id: 'DESC' },
    });
  }

  findFilledOrders(manager: EntityManager, userId: number) {
    return manager.getRepository(Order).find({
      where: { userId, status: 'FILLED' },
      relations: { instrument: true },
    });
  }

  create(manager: EntityManager, order: Pick<Order, 'instrumentId' | 'userId' | 'size' | 'price' | 'side' | 'status' | 'type' | 'datetime'>) {
    return manager.getRepository(Order).save(manager.create(Order, order));
  }

  findOrderForUpdate(manager: EntityManager, userId: number, orderId: number) {
    return manager
      .getRepository(Order)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.id = :orderId', { orderId })
      .andWhere('order.userid = :userId', { userId })
      .getOne();
  }

  save(manager: EntityManager, order: Order) {
    return manager.getRepository(Order).save(order);
  }
}
