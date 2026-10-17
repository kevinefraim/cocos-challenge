export const MAX_ORDER_SIZE = 2_147_483_647;

export type CreateOrderInput = {
  instrumentId: number;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity?: number;
  amount?: string;
  price?: string;
};
