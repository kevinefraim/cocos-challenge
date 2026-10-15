import { Decimal as BaseDecimal } from 'decimal.js';

// Covers the supported 20-character budget and int32 quantities, including sums.
// Clone avoids changing the arithmetic policy of unrelated dependencies.
export const Decimal = BaseDecimal.clone({ precision: 60, rounding: BaseDecimal.ROUND_HALF_UP });
export type Decimal = BaseDecimal;
