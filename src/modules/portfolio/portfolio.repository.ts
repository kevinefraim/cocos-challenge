import type { DataSource } from 'typeorm';

import { MarketData } from '../../database/entities/MarketData.js';
import { Order } from '../../database/entities/Order.js';
import { User } from '../../database/entities/User.js';

export class PortfolioRepository {
  constructor(private readonly dataSource: DataSource) {}

  findUser(userId: number) {
    return this.dataSource.getRepository(User).findOneBy({ id: userId });
  }

  findFilledOrders(userId: number) {
    return this.dataSource.getRepository(Order).find({
      where: { userId, status: 'FILLED' },
      relations: { instrument: true },
      order: { datetime: 'ASC', id: 'ASC' },
    });
  }

  findLatestMarketData(instrumentIds: number[]) {
    if (instrumentIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.dataSource
      .getRepository(MarketData)
      .createQueryBuilder('marketData')
      .distinctOn(['marketData.instrumentid'])
      .where('marketData.instrumentid IN (:...instrumentIds)', { instrumentIds })
      .orderBy('marketData.instrumentid', 'ASC')
      .addOrderBy('marketData.date', 'DESC')
      .addOrderBy('marketData.id', 'DESC')
      .getMany();
  }
}
