export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Cocos Backend Challenge API',
    version: '1.0.0',
    description:
      'Simplified investment-account API. Amounts and monetary values are ARS decimal strings.',
  },
  paths: {
    '/health': {
      get: { summary: 'Liveness check', responses: { 200: { description: 'Process is alive' } } },
    },
    '/ready': {
      get: {
        summary: 'Database readiness check',
        responses: {
          200: { description: 'Database is reachable' },
          503: { description: 'Database is unavailable' },
        },
      },
    },
    '/instruments': {
      get: {
        summary: 'Search instruments by ticker or name',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2, maxLength: 50 },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Paginated instruments' },
          400: { description: 'Invalid query' },
        },
      },
    },
    '/users/{userId}/portfolio': {
      get: {
        summary: 'Get user portfolio',
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: { 200: { description: 'Portfolio' }, 404: { description: 'User not found' } },
      },
    },
    '/users/{userId}/orders': {
      post: {
        summary: 'Create a market or limit buy/sell order',
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrder' } } },
        },
        responses: {
          201: { description: 'Order persisted; status may be FILLED, NEW, or REJECTED' },
          400: { description: 'Invalid payload' },
        },
      },
    },
    '/users/{userId}/orders/{orderId}/cancel': {
      patch: {
        summary: 'Cancel a pending limit order',
        parameters: [
          { $ref: '#/components/parameters/UserId' },
          { $ref: '#/components/parameters/OrderId' },
        ],
        responses: {
          200: { description: 'Order cancelled' },
          404: { description: 'Order not found' },
          409: { description: 'Order is not cancellable' },
        },
      },
    },
  },
  components: {
    parameters: {
      UserId: {
        name: 'userId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      OrderId: {
        name: 'orderId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
    },
    schemas: {
      CreateOrder: {
        type: 'object',
        required: ['instrumentId', 'side', 'type'],
        properties: {
          instrumentId: { type: 'integer', minimum: 1, example: 1 },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          type: { type: 'string', enum: ['MARKET', 'LIMIT'] },
          quantity: { type: 'integer', minimum: 1, example: 10 },
          amount: { type: 'string', example: '10000.00' },
          price: {
            type: 'string',
            example: '259.00',
            description: 'Required only for LIMIT orders',
          },
        },
      },
    },
  },
} as const;
