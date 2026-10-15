import { describe, it, expect } from 'vitest';
import { Decimal } from '../src/shared/money/decimal.js';

describe('financial precision', () => {
  it('retains cents when summing ten maximum order notionals', () => {
    const notional = new Decimal('99999999.99').mul(2147483647);
    let total = new Decimal(0);
    for (let i = 0; i < 10; i++) total = total.plus(notional);
    expect(total.toFixed(2)).toBe('2147483646785251635.30');
  });
});
