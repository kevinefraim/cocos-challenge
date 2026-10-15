import { MAX_DATABASE_INTEGER } from '../shared/validation/identifiers.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: 'integer', minimum: 1, maximum: MAX_DATABASE_INTEGER };
const money = { type: 'string', pattern: '^-?[0-9]+\\.[0-9]{2}$', example: '1000.00' };
const positiveMoney = {
  type: 'string',
  maxLength: 20,
  pattern: '^(?=.*[1-9])[0-9]+(\\.[0-9]{1,2})?$',
  example: '1000.00',
};
const price = {
  ...positiveMoney,
  pattern: '^0*(?=[0-9.]*[1-9])[0-9]{1,8}(\\.[0-9]{1,2})?$',
  description: 'Positive ARS decimal string, at most 99999999.99 and two decimal places.',
};
const response = (description: string, schema: object) => ({
  description,
  content: { 'application/json': { schema } },
});
const errors = (...statuses: number[]) =>
  Object.fromEntries(
    statuses.map((status) => [
      status,
      response(
        (
          {
            400: 'Invalid input',
            404: 'Resource not found',
            409: 'State conflict or unavailable market price',
            413: 'JSON body exceeds 100kb',
            415: 'Unsupported JSON charset or encoding',
            500: 'Unexpected internal error',
            503: 'Database or portfolio quote unavailable',
          } as Record<number, string>
        )[status],
        ref('Error'),
      ),
    ]),
  );

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Cocos Backend Challenge API',
    version: '1.0.0',
    description:
      'ARS money is serialized as decimal strings. IDs are positive PostgreSQL int32 values. No authentication is required by the challenge. LIMIT orders do not reserve balances.',
  },
  paths: {
    '/health': {
      get: { summary: 'Process liveness', responses: { 200: response('Alive', ref('Health')) } },
    },
    '/ready': {
      get: {
        summary: 'Database readiness',
        responses: { 200: response('Ready', ref('Health')), ...errors(503) },
      },
    },
    '/instruments': {
      get: {
        summary:
          'Search ticker or name, case-insensitively; excludes MONEDA; literal wildcard characters',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2, maxLength: 50 },
            description: 'Trimmed before validation',
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          200: response('Sorted by ticker then ID', ref('InstrumentSearch')),
          ...errors(400, 500, 503),
        },
      },
    },
    '/users/{userId}/portfolio': {
      get: {
        summary: 'Balances and positions from FILLED orders',
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: { 200: response('Portfolio', ref('Portfolio')), ...errors(400, 404, 500, 503) },
      },
    },
    '/users/{userId}/orders': {
      post: {
        summary: 'Create a buy/sell MARKET or LIMIT order',
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('CreateOrder') } },
        },
        responses: {
          201: response(
            'Persisted order. REJECTED is a domain outcome and does not change balances.',
            ref('CreateOrderResult'),
          ),
          ...errors(400, 404, 409, 413, 415, 500, 503),
        },
      },
    },
    '/users/{userId}/orders/{orderId}/cancel': {
      patch: {
        summary: 'Cancel an owned NEW order',
        parameters: [
          { $ref: '#/components/parameters/UserId' },
          { $ref: '#/components/parameters/OrderId' },
        ],
        responses: {
          200: response('Cancelled order', ref('OrderResponse')),
          ...errors(400, 404, 409, 500, 503),
        },
      },
    },
  },
  components: {
    parameters: {
      UserId: { name: 'userId', in: 'path', required: true, schema: id },
      OrderId: { name: 'orderId', in: 'path', required: true, schema: id },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error', 'requestId'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          requestId: { type: 'string' },
        },
      },
      Health: {
        type: 'object',
        required: ['status', 'requestId'],
        properties: {
          status: { type: 'string', enum: ['ok', 'ready'] },
          requestId: { type: 'string' },
        },
      },
      CreateOrder: {
        description:
          'Exactly one of quantity or amount. MARKET forbids price; LIMIT requires price. Amount converts to floor(amount / effectivePrice), at least one and at most 2147483647 shares. Insufficient balance persists REJECTED.',
        oneOf: ['MARKET', 'LIMIT'].flatMap((type) =>
          ['quantity', 'amount'].map((size) => ({
            type: 'object',
            required: [
              'instrumentId',
              'side',
              'type',
              size,
              ...(type === 'LIMIT' ? ['price'] : []),
            ],
            properties: {
              instrumentId: id,
              side: { type: 'string', enum: ['BUY', 'SELL'] },
              type: { type: 'string', enum: [type] },
              quantity: id,
              amount: positiveMoney,
              price,
            },
            not: {
              anyOf: [
                { required: [size === 'quantity' ? 'amount' : 'quantity'] },
                ...(type === 'MARKET' ? [{ required: ['price'] }] : []),
              ],
            },
          })),
        ),
      },
      Order: {
        type: 'object',
        required: [
          'id',
          'userId',
          'instrumentId',
          'side',
          'type',
          'status',
          'quantity',
          'price',
          'datetime',
        ],
        properties: {
          id,
          userId: id,
          instrumentId: id,
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          type: { type: 'string', enum: ['MARKET', 'LIMIT'] },
          status: { type: 'string', enum: ['NEW', 'FILLED', 'REJECTED', 'CANCELLED'] },
          quantity: id,
          price: money,
          datetime: { type: 'string', format: 'date-time' },
        },
      },
      OrderResponse: {
        allOf: [
          ref('Order'),
          {
            type: 'object',
            required: ['requestId'],
            properties: { requestId: { type: 'string' } },
          },
        ],
      },
      CreateOrderResult: {
        type: 'object',
        required: ['order', 'requestId'],
        properties: {
          order: ref('Order'),
          requestId: { type: 'string' },
          rejectionReason: { type: 'string', enum: ['INSUFFICIENT_CASH', 'INSUFFICIENT_HOLDINGS'] },
        },
      },
      Instrument: {
        type: 'object',
        required: ['id', 'ticker', 'name', 'type'],
        properties: {
          id,
          ticker: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
        },
      },
      InstrumentSearch: {
        type: 'object',
        required: ['data', 'pagination', 'requestId'],
        properties: {
          data: { type: 'array', items: ref('Instrument') },
          requestId: { type: 'string' },
          pagination: {
            type: 'object',
            required: ['page', 'pageSize', 'total'],
            properties: {
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              total: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
      Position: {
        type: 'object',
        required: [
          'instrumentId',
          'ticker',
          'name',
          'quantity',
          'averageCost',
          'lastPrice',
          'marketValue',
          'unrealizedReturnPercent',
          'dailyReturnPercent',
        ],
        properties: {
          instrumentId: id,
          ticker: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'integer' },
          averageCost: money,
          lastPrice: money,
          marketValue: money,
          unrealizedReturnPercent: money,
          dailyReturnPercent: { ...money, nullable: true },
        },
      },
      Portfolio: {
        type: 'object',
        required: ['userId', 'currency', 'availableCash', 'accountTotal', 'positions', 'requestId'],
        properties: {
          userId: id,
          currency: { type: 'string', enum: ['ARS'] },
          availableCash: money,
          accountTotal: money,
          positions: { type: 'array', items: ref('Position') },
          requestId: { type: 'string' },
        },
      },
    },
  },
};
