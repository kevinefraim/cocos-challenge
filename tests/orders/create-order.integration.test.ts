import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { appDataSource } from '../../src/database/data-source.js';
import { Order } from '../../src/database/entities/Order.js';

const app = createApp(appDataSource);
const createdOrderIds: number[] = [];

describe('POST /users/:userId/orders', () => {
  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterEach(async () => {
    if (createdOrderIds.length > 0) {
      await appDataSource.getRepository(Order).delete(createdOrderIds.splice(0));
    }
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  it('creates and immediately fills a valid market buy', async () => {
    const response = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      })
      .expect(201);

    createdOrderIds.push(response.body.order.id);

    expect(response.body.order).toMatchObject({
      userId: 1,
      instrumentId: 1,
      side: 'BUY',
      type: 'MARKET',
      status: 'FILLED',
      quantity: 1,
    });
  });

  it('persists an insufficient-funds market order as rejected', async () => {
    const response = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'MARKET',
        amount: '999999999.00',
      })
      .expect(201);

    createdOrderIds.push(response.body.order.id);

    expect(response.body.order.status).toBe('REJECTED');
    expect(response.body.rejectionReason).toBe('INSUFFICIENT_CASH');
  });
});
