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
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await appDataSource.destroy();
  });

  it('serves health, readiness, documentation, portfolio, and instrument search', async () => {
    const health = await requestJson('/health');
    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const readiness = await requestJson('/ready');
    expect(readiness.response.status).toBe(200);
    expect(readiness.body).toEqual({ status: 'ready' });

    const openApi = await requestJson('/openapi.json');
    expect(openApi.response.status).toBe(200);
    expect(openApi.body.openapi).toBe('3.0.3');

    const instruments = await requestJson('/instruments?q=gas&page=1&pageSize=2');
    expect(instruments.response.status).toBe(200);
    expect(instruments.body.data.length).toBeGreaterThan(0);

    const portfolio = await requestJson('/users/1/portfolio');
    expect(portfolio.response.status).toBe(200);
    expect(portfolio.body).toMatchObject({ userId: 1, currency: 'ARS' });
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
  });
});
