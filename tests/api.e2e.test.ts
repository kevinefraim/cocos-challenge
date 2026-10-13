import type { Server } from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { appDataSource } from '../src/database/data-source.js';
import { Order } from '../src/database/entities/Order.js';

let server: Server;
let baseUrl: string;
const createdOrderIds: number[] = [];

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, body: await response.json() };
}

describe('API end-to-end', () => {
  beforeAll(async () => {
    await appDataSource.initialize();
    const app = createApp(appDataSource);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not resolve the E2E server address');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (createdOrderIds.length > 0) {
      await appDataSource.getRepository(Order).delete(createdOrderIds.splice(0));
    }
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    if (appDataSource.isInitialized) {
      await appDataSource.destroy();
    }
  });

  it('serves health, readiness, documentation, portfolio, and instrument search', async () => {
    const health = await requestJson('/health');
    expect(health.response.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok' });
    expect(health.body.requestId).toEqual(expect.any(String));

    const readiness = await requestJson('/ready');
    expect(readiness.response.status).toBe(200);
    expect(readiness.body).toMatchObject({ status: 'ready' });

    const openApi = await requestJson('/openapi.json');
    expect(openApi.response.status).toBe(200);
    expect(openApi.body.openapi).toBe('3.0.3');

    const instruments = await requestJson('/instruments?q=gas&page=1&pageSize=2');
    expect(instruments.response.status).toBe(200);
    expect(instruments.body.data.length).toBeGreaterThan(0);
    expect(instruments.body.requestId).toEqual(expect.any(String));

    const portfolio = await requestJson('/users/1/portfolio');
    expect(portfolio.response.status).toBe(200);
    expect(portfolio.body).toMatchObject({ userId: 1, currency: 'ARS' });
    expect(portfolio.body.requestId).toEqual(expect.any(String));
  });

  it('creates and cancels a limit order over a real HTTP socket', async () => {
    const creation = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instrumentId: 1,
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: '1.00',
      }),
    });

    expect(creation.response.status).toBe(201);
    expect(creation.body.order.status).toBe('NEW');
    createdOrderIds.push(creation.body.order.id);

    const cancellation = await requestJson(`/users/1/orders/${creation.body.order.id}/cancel`, {
      method: 'PATCH',
    });

    expect(cancellation.response.status).toBe(200);
    expect(cancellation.body.status).toBe('CANCELLED');
    expect(cancellation.body.requestId).toEqual(expect.any(String));
  });

  it('handles order outcomes, input limits, and invalid resources', async () => {
    const buy = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 1, side: 'BUY', type: 'MARKET', amount: '1000.00' }),
    });
    expect(buy.response.status).toBe(201);
    expect(buy.body.order.status).toBe('FILLED');
    createdOrderIds.push(buy.body.order.id);

    const rejectedSale = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 47, side: 'SELL', type: 'MARKET', quantity: 999999 }),
    });
    expect(rejectedSale.response.status).toBe(201);
    expect(rejectedSale.body).toMatchObject({ rejectionReason: 'INSUFFICIENT_HOLDINGS' });
    createdOrderIds.push(rejectedSale.body.order.id);

    const invalidPayload = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 1, amount: '1.00' }),
    });
    expect(invalidPayload.response.status).toBe(400);
    expect(invalidPayload.body.error.code).toBe('INVALID_ORDER');

    const oversizedQuantity = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 1, side: 'BUY', type: 'MARKET', quantity: 2147483648 }),
    });
    expect(oversizedQuantity.response.status).toBe(400);

    const unknownInstrument = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 999999, side: 'BUY', type: 'MARKET', quantity: 1 }),
    });
    expect(unknownInstrument.response.status).toBe(404);
  });

  it('returns JSON errors for malformed JSON, unknown routes, and bounded searches', async () => {
    const malformed = await requestJson('/users/1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    expect(malformed.response.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const missing = await requestJson('/missing-route');
    expect(missing.response.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    const wildcardSearch = await requestJson('/instruments?q=%25&page=1&pageSize=20');
    expect(wildcardSearch.response.status).toBe(200);
    expect(wildcardSearch.body.pagination.total).toBe(0);

    const excessivePage = await requestJson('/instruments?q=gas&page=10001&pageSize=20');
    expect(excessivePage.response.status).toBe(400);
  });

  it('serializes concurrent market orders for one user', async () => {
    const payload = JSON.stringify({ instrumentId: 5, side: 'BUY', type: 'MARKET', quantity: 60 });
    const [first, second] = await Promise.all([
      requestJson('/users/1/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }),
      requestJson('/users/1/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }),
    ]);

    createdOrderIds.push(first.body.order.id, second.body.order.id);
    expect([first.response.status, second.response.status]).toEqual([201, 201]);
    expect([first.body.order.status, second.body.order.status].sort()).toEqual(['FILLED', 'REJECTED']);
  });
});
