import { describe, expect, it } from 'vitest';

import {
  canCancelOrder,
  getInitialOrderStatus,
} from '../../src/modules/orders/order-state-machine.js';

describe('order state machine', () => {
  it('fills a valid market order immediately', () => {
    expect(getInitialOrderStatus('MARKET', true)).toBe('FILLED');
  });

  it('keeps a valid limit order pending', () => {
    expect(getInitialOrderStatus('LIMIT', true)).toBe('NEW');
  });

  it('rejects an order with insufficient balance', () => {
    expect(getInitialOrderStatus('MARKET', false)).toBe('REJECTED');
    expect(getInitialOrderStatus('LIMIT', false)).toBe('REJECTED');
  });

  it('only allows cancellation from NEW', () => {
    expect(canCancelOrder('NEW')).toBe(true);
    expect(canCancelOrder('FILLED')).toBe(false);
    expect(canCancelOrder('REJECTED')).toBe(false);
    expect(canCancelOrder('CANCELLED')).toBe(false);
  });
});
