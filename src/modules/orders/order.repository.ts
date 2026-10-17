import type { Instrument, MarketData, NewOrder, Order, User } from '../../domain/models.js';

// Sólo válido durante el callback de withTransaction; no debe guardarse ni reutilizarse.
export interface TransactionalOrderRepository {
  /** Serializa las operaciones sobre el saldo del usuario hasta commit/rollback. */
  findUserForUpdate(userId: number): Promise<User | null>;
  findInstrument(instrumentId: number): Promise<Instrument | null>;
  findLatestMarketData(instrumentId: number): Promise<MarketData | null>;
  findFilledOrders(userId: number): Promise<Order[]>;
  create(order: NewOrder): Promise<Order>;
  /** Bloquea la orden, respetando su propietario, hasta finalizar la transacción. */
  findOrderForUpdate(userId: number, orderId: number): Promise<Order | null>;
  save(order: Order): Promise<Order>;
}

export interface OrderRepository {
  /** Todas las operaciones son atómicas y comparten los mismos locks.
   * Resuelve después del commit; ante un error revierte y propaga el error original.
   */
  withTransaction<T>(work: (repository: TransactionalOrderRepository) => Promise<T>): Promise<T>;
}
