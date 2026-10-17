import type { MarketData, PortfolioOrder, User } from '../../domain/models.js';

export interface PortfolioRepository {
  findUser(userId: number): Promise<User | null>;
  /** Historial FILLED cronológico, con desempate por id ascendente. */
  findFilledOrders(userId: number): Promise<PortfolioOrder[]>;
  /** Última fecha por instrumento, con desempate por id descendente. */
  findLatestMarketData(instrumentIds: number[]): Promise<MarketData[]>;
}
