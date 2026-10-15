export type OrderStatus = 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';
export type OrderType = 'MARKET' | 'LIMIT';

export function getInitialOrderStatus(type: OrderType, hasSufficientBalance: boolean): OrderStatus {
  if (!hasSufficientBalance) {
    return 'REJECTED';
  }

  return type === 'MARKET' ? 'FILLED' : 'NEW';
}

export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'NEW';
}
