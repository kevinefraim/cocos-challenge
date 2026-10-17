import type { PortfolioRepository } from '../../modules/portfolio/portfolio.repository.js';
import { toUser, toPortfolioOrder, toMarketData } from './mappers.js';
import { In, type DataSource } from 'typeorm';

import { MarketData } from '../entities/MarketData.js';
import { Order } from '../../database/entities/Order.js';
import { User } from '../../database/entities/User.js';

export class TypeOrmPortfolioRepository implements PortfolioRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findUser(userId: number) {
    const user = await this.dataSource.getRepository(User).findOneBy({ id: userId });
    return user ? toUser(user) : null;
  }

  async findFilledOrders(userId: number) {
    const orders = await this.dataSource.getRepository(Order).find({
      where: { userId, status: 'FILLED' },
      relations: { instrument: true },
      order: { datetime: 'ASC', id: 'ASC' },
    });
    return orders.map(toPortfolioOrder);
  }

  async findLatestMarketData(instrumentIds: number[]) {
    if (instrumentIds.length === 0) {
      return [];
    }

    const quotes = await this.dataSource
      .getRepository(MarketData)
      .createQueryBuilder('marketData')
      .distinctOn(['marketData.instrumentId'])
      .setFindOptions({ where: { instrumentId: In(instrumentIds) } })
      .orderBy('marketData.instrumentId', 'ASC')
      .addOrderBy('marketData.date', 'DESC')
      .addOrderBy('marketData.id', 'DESC')
      .getMany();
    return quotes.map(toMarketData);
  }
}
