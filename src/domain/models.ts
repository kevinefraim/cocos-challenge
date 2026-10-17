// Tipos de negocio: no dependen del ORM ni representan entidades de persistencia.
export type User = { id: number };

export type Instrument = {
  id: number;
  ticker: string;
  name: string;
  type: string;
};

export type MarketData = {
  instrumentId: number;
  close: string | null;
  previousClose: string | null;
};

export type Order = {
  id: number;
  instrumentId: number;
  userId: number;
  size: number;
  price: string | null;
  side: string;
  status: string;
  type: string;
  datetime: Date;
};

export type PortfolioOrder = Order & { instrument: Instrument };
export type NewOrder = Omit<Order, 'id'>;
