# Cocos backend challenge — functional specification

## Purpose and scope

Build a REST API for a simplified investment account. This document is the
functional source of truth: when the original challenge leaves a business
detail ambiguous, the decision recorded here applies.

The API supports viewing a portfolio, searching instruments, creating buy and
sell orders, and cancelling pending limit orders. Cancellation is a small,
explicit extension of the challenge rules.

Out of scope: authentication, market simulation, matching limit orders,
settlement, fees/taxes, fractional shares, reservations for pending orders,
and a frontend.

## Domain model

| Entity        | Responsibility                                             |
| ------------- | ---------------------------------------------------------- |
| `users`       | Account holders.                                           |
| `instruments` | Securities and ARS cash (`type = MONEDA`).                 |
| `marketdata`  | Historic quotes; the most recent row is the current quote. |
| `orders`      | Record of cash movements, trades, and their status.        |

`orders.size` is always a positive integer. `side` determines its economic
sign. Money is represented as decimal values in ARS.

## Order state machine

```text
valid MARKET order  ─────────────────────────────> FILLED
valid LIMIT order   ─────────────────────────────> NEW ── cancel ──> CANCELLED
invalid order due to insufficient funds/holdings ─> REJECTED
```

The only post-creation transition exposed by this API is `NEW -> CANCELLED`.
`FILLED`, `REJECTED`, and `CANCELLED` are terminal. A future matching engine
may add `NEW -> FILLED`; it is not part of this challenge.

## Business rules

### Prices and quantities

- All prices are ARS.
- `price` y `amount` se reciben como strings decimales positivos, con hasta dos
  decimales y 20 caracteres; no se acepta notación científica. El precio LIMIT
  máximo es `99999999.99`. La cantidad, incluida la calculada por monto, debe
  estar entre 1 y `2147483647`.
- A `MARKET` order uses the instrument's latest `marketdata.close` price;
  clients must not supply a price.
- “Latest” means the row ordered by `date DESC, id DESC`. A `MARKET` order is
  rejected with `409` when the instrument has no market-data row or its latest
  `close` is missing, zero, or negative.
- A `LIMIT` order requires a positive client-supplied `price`.
- Para MARKET, el último `close` se redondea a dos decimales con `ROUND_HALF_UP`
  antes de convertir el monto en cantidad, validar fondos y guardar la orden.
  Por ejemplo, `10.005` pasa a `10.01`. Si el precio redondeado no es finito o
  no es positivo, se devuelve `409` sin crear una orden.
- Each trade supplies exactly one of `quantity` (positive integer) or `amount`
  (positive ARS amount). For `amount`, quantity is `floor(amount / effectivePrice)`.
  An amount unable to purchase one share is invalid.
- Fractional shares are never accepted.

### Validation and status

- A `BUY` validates cash using `quantity * effectivePrice`.
- El saldo o la tenencia exactos alcanzan: se permite operar todo lo disponible.
  Dos operaciones simultáneas sobre el mismo usuario no pueden consumir los
  mismos fondos o acciones dos veces.
- A `SELL` validates the currently held quantity of the instrument.
- Insufficient cash or holdings creates a `REJECTED` order. The supplied schema
  persists the status but has no rejection-reason column; the response includes
  a reason code and application logs retain the diagnostic context.
- Valid `MARKET` orders are immediately `FILLED`; valid `LIMIT` orders are `NEW`.
- Only a `NEW` order owned by the requested user can be cancelled.
- `NEW` orders do not affect cash or holdings. The simplified model has no
  reservation for simultaneous pending orders; production would add reservations
  or an immutable ledger.
- Los errores de entrada o recursos inexistentes no crean órdenes. En cambio,
  la insuficiencia de fondos o tenencia persiste `REJECTED`, responde `201` y no
  modifica el portfolio. Cancelar tampoco modifica saldos ni posiciones.

### Portfolio calculations

Only `FILLED` orders affect balances and positions.

- Available ARS = filled `CASH_IN` minus `CASH_OUT`, minus filled buy notionals,
  plus filled sell notionals.
- Los movimientos de efectivo usan únicamente `size`; su `price` histórico puede
  ser `NULL` y no interviene en el cálculo.
- Position quantity = filled buys minus filled sells for each non-`MONEDA`
  instrument. Zero positions are omitted. Historical data may contain a net
  short position; it is returned with a negative quantity, although new sell
  orders remain subject to the no-short-selling validation rule.
- Market value = quantity × latest `close`.
- Cost basis uses moving weighted-average purchase cost. A sale reduces quantity
  at the current average cost and does not change that average.
- `unrealizedReturnPercent` = `(latestClose - averageCost) / averageCost * 100`
  for long positions, reversing the subtraction for short positions.
- `dailyReturnPercent` = `(latestClose - previousClose) / previousClose * 100`.
  It is provided because the original challenge explicitly supplies
  `previousClose` for this calculation.
- Si `previousClose` es cero, `dailyReturnPercent` es `null`, evitando dividir
  por cero. Si falta una cotización necesaria, `close` no es finito/positivo o
  `previousClose` es nulo, negativo o no finito, se devuelve `503` en lugar de
  informar una valuación parcial. Un historial con costo medio no positivo o
  un lado de operación no soportado devuelve `500`.
- Account total = available ARS + sum of market values.

## HTTP contract

API responses are JSON (the `/docs` UI is HTML). IDs are positive integers up
to 2147483647. Datetimes are UTC ISO-8601 strings; historical timestamps without
an offset are interpreted as UTC.
Las respuestas JSON incluyen `requestId`; los ejemplos de importes son
ilustrativos y no representan necesariamente el saldo actual de la base compartida.

### `GET /users/:userId/portfolio`

Returns `404` when the user does not exist.

```json
{
  "userId": 1,
  "currency": "ARS",
  "availableCash": "815000.00",
  "accountTotal": "852034.00",
  "positions": [
    {
      "instrumentId": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "quantity": 40,
      "averageCost": "930.00",
      "lastPrice": "925.85",
      "marketValue": "37034.00",
      "unrealizedReturnPercent": "-0.45",
      "dailyReturnPercent": "0.44"
    }
  ],
  "requestId": "..."
}
```

### `GET /instruments?q=<text>&page=1&pageSize=20`

`q` is required (2–50 characters) and searches ticker and name
case-insensitively. Results are sorted by ticker and exclude `MONEDA`
instruments, which are not tradable securities in this API.
Se recortan espacios externos de `q` antes de validar su longitud. Los caracteres
`%`, `_` y `\` se buscan literalmente, no como comodines SQL. El orden es
`ticker ASC, id ASC`. `page` admite 1–10000 (por defecto 1) y `pageSize` 1–100
(por defecto 20). La respuesta incluye `data` y `pagination`, con el total de
coincidencias antes de paginar. Una búsqueda sin resultados devuelve `200` y
una lista vacía.

Los IDs de ruta y la paginación se convierten a números antes de comprobar que
son enteros dentro del rango permitido; la política valida su valor numérico,
no exige una representación textual exclusivamente con dígitos.

### `POST /users/:userId/orders`

```json
{
  "instrumentId": 47,
  "side": "BUY",
  "type": "MARKET",
  "quantity": 10
}
```

For `LIMIT`, add `"price": "925.50"`. Replace `quantity` with `amount` to
place an order by ARS budget. Any persisted order returns `201 Created`,
including one with `REJECTED` status: rejection is a persisted domain outcome.
Rejected responses additionally include a `rejectionReason` code; this code is
not stored because the supplied schema has no such column.

### `PATCH /users/:userId/orders/:orderId/cancel`

Returns the cancelled order. It returns `404` when the order is missing or is
not owned by that user and `409` when it is not `NEW`.

## Error contract

Input failures return `400` (or `413` when a JSON body exceeds the configured
limit, or `415` for unsupported JSON charset/encoding); missing resources return `404`; illegal state transitions and unavailable
market data for a market order return `409`; an unavailable database or invalid
quote needed to value a portfolio returns `503`; unexpected errors return `500`.

```json
{
  "error": {
    "code": "ORDER_NOT_CANCELLABLE",
    "message": "Only NEW orders can be cancelled"
  },
  "requestId": "..."
}
```
