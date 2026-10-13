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

  it('creates a market order from an ARS amount', async () => {
    const response = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'MARKET',
        amount: '1000.00',
      })
      .expect(201);

    createdOrderIds.push(response.body.order.id);

    expect(response.body.order.status).toBe('FILLED');
    expect(response.body.order.quantity).toBeGreaterThan(0);
  });

  it('rejects an amount that cannot purchase one share', async () => {
    await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'MARKET',
        amount: '0.01',
      })
      .expect(400);
  });

  it('fills a valid market sell and rejects insufficient holdings', async () => {
    const sale = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 47,
        side: 'SELL',
        type: 'MARKET',
        quantity: 1,
      })
      .expect(201);

    createdOrderIds.push(sale.body.order.id);
    expect(sale.body.order.status).toBe('FILLED');

    const rejection = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 47,
        side: 'SELL',
        type: 'MARKET',
        quantity: 999999,
      })
      .expect(201);

    createdOrderIds.push(rejection.body.order.id);
    expect(rejection.body.order.status).toBe('REJECTED');
    expect(rejection.body.rejectionReason).toBe('INSUFFICIENT_HOLDINGS');
  });

  it('validates the order contract and resource identifiers', async () => {
    await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        amount: '100.00',
      })
      .expect(400);

    await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
      })
      .expect(400);

    await request(app)
      .post('/users/999999/orders')
      .send({ instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 1 })
      .expect(404);

    await request(app)
      .post('/users/1/orders')
      .send({ instrumentId: 999999, side: 'BUY', type: 'MARKET', quantity: 1 })
      .expect(404);
  });

  it('cancels a pending limit order', async () => {
    const creation = await request(app)
      .post('/users/1/orders')
      .send({
        instrumentId: 1,
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: '1.00',
      })
      .expect(201);

    createdOrderIds.push(creation.body.order.id);

    const cancellation = await request(app)
      .patch(`/users/1/orders/${creation.body.order.id}/cancel`)
      .expect(200);

    expect(cancellation.body.status).toBe('CANCELLED');

    await request(app)
      .patch(`/users/1/orders/${creation.body.order.id}/cancel`)
      .expect(409);
  });

  it('does not cancel a filled order', async () => {
    const creation = await request(app)
      .post('/users/1/orders')
      .send({ instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 1 })
      .expect(201);

    createdOrderIds.push(creation.body.order.id);

    await request(app)
      .patch(`/users/1/orders/${creation.body.order.id}/cancel`)
      .expect(409);
  });

  it('serializes concurrent orders for the same user', async () => {
    const payload = { instrumentId: 5, side: 'BUY', type: 'MARKET', quantity: 60 };

    const [first, second] = await Promise.all([
      request(app).post('/users/1/orders').send(payload),
      request(app).post('/users/1/orders').send(payload),
    ]);

    createdOrderIds.push(first.body.order.id, second.body.order.id);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect([first.body.order.status, second.body.order.status].sort()).toEqual(['FILLED', 'REJECTED']);
  });
});
