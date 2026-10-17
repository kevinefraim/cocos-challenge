import type { Instrument, MarketData, Order, PortfolioOrder, User } from '../../domain/models.js';

// Copias explícitas: nunca se devuelven instancias ni relaciones del ORM al negocio.
export const toUser = (user: User): User => ({ id: user.id });

export const toInstrument = (instrument: Instrument): Instrument => ({
  id: instrument.id,
  ticker: instrument.ticker,
  name: instrument.name,
  type: instrument.type,
});

export const toMarketData = (quote: MarketData): MarketData => ({
  instrumentId: quote.instrumentId,
  close: quote.close,
  previousClose: quote.previousClose,
});

export const toOrder = (order: Order): Order => ({
  id: order.id,
  instrumentId: order.instrumentId,
  userId: order.userId,
  size: order.size,
  price: order.price,
  side: order.side,
  status: order.status,
  type: order.type,
  datetime: new Date(order.datetime),
});

export const toPortfolioOrder = (order: PortfolioOrder): PortfolioOrder => ({
  ...toOrder(order),
  instrument: toInstrument(order.instrument),
});
