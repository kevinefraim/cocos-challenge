import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { appDataSource } from '../src/database/data-source.js';
import { Instrument } from '../src/database/entities/Instrument.js';
import { Order } from '../src/database/entities/Order.js';
import { User } from '../src/database/entities/User.js';
import { MarketData } from '../src/database/entities/MarketData.js';
import { In } from 'typeorm';
import pino from 'pino';
import { contractFor } from './contract.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

let server: Server;
let baseUrl: string;
let testUserId: number;
let cashInstrumentId: number;
let instrumentId: number;
let otherInstrumentId: number;
let otherUserId: number;
const fixtureUserIds: number[] = [];
const fixtureInstrumentIds: number[] = [];
const searchToken = randomUUID().replaceAll('-', '').slice(0, 6);

async function place(payload: object, userId = testUserId) {
  return requestJson(`/users/${userId}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
async function portfolio(userId = testUserId) {
  const result = await requestJson(`/users/${userId}/portfolio`);
  expect(result.response.status).toBe(200);
  return result.body;
}
async function quote(price: string, id = instrumentId) {
  return appDataSource
    .getRepository(MarketData)
    .save({ instrumentId: id, date: '2026-01-02', close: price, previousClose: '8000.00' });
}
async function fund(size: number, userId = testUserId) {
  await appDataSource.getRepository(Order).save({
    instrumentId: cashInstrumentId,
    userId,
    size,
    price: null,
    side: 'CASH_IN',
    status: 'FILLED',
    type: 'MARKET',
    datetime: new Date(),
  });
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  const schema =
    response.status >= 400
      ? 'Error'
      : path.endsWith('/cancel')
        ? 'OrderResponse'
        : path.endsWith('/orders')
          ? 'CreateOrderResult'
          : path.includes('/portfolio')
            ? 'Portfolio'
            : path.startsWith('/instruments')
              ? 'InstrumentSearch'
              : path === '/health'
                ? 'Liveness'
                : path === '/ready'
                  ? 'Health'
                  : null;
  if (schema) {
    const validate = contractFor(schema);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  return { response, body };
}

describe('API end-to-end', { timeout: 30_000, hookTimeout: 30_000 }, () => {
  beforeAll(async () => {
    await appDataSource.initialize();
    const user = await appDataSource.getRepository(User).save({
      email: `e2e-${randomUUID()}@example.test`,
      accountNumber: `E2E-${randomUUID().slice(0, 12)}`,
    });
    testUserId = user.id;
    fixtureUserIds.push(user.id);
    const other = await appDataSource.getRepository(User).save({
      email: `e2e-${randomUUID()}@example.test`,
      accountNumber: `E2E-${randomUUID().slice(0, 12)}`,
    });
    otherUserId = other.id;
    fixtureUserIds.push(other.id);
    for (const [suffix, type] of [
      ['A', 'ACCIONES'],
      ['B', 'ACCIONES'],
      ['C', 'MONEDA'],
    ]) {
      const security = await appDataSource
        .getRepository(Instrument)
        .save({ ticker: `${searchToken}${suffix}`, name: `Review ${searchToken} ${suffix}`, type });
      fixtureInstrumentIds.push(security.id);
    }
    [instrumentId, otherInstrumentId, cashInstrumentId] = fixtureInstrumentIds;

    const app = createApp(appDataSource, pino({ level: 'silent' }));

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

  beforeEach(async () => {
    await appDataSource
      .getRepository(MarketData)
      .delete({ instrumentId: In(fixtureInstrumentIds) });
    await quote('10000.00');
    await quote('10000.00', otherInstrumentId);
    await fund(1_000_000);
    await fund(1_000_000, otherUserId);
  });

  afterEach(async () => {
    await appDataSource.getRepository(Order).delete({ userId: In(fixtureUserIds) });
  });

  afterAll(async () => {
    try {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    } finally {
      if (appDataSource.isInitialized) {
        try {
          await appDataSource.transaction(async (manager) => {
            if (fixtureUserIds.length) {
              await manager.getRepository(Order).delete({ userId: In(fixtureUserIds) });
              await manager.getRepository(User).delete(fixtureUserIds);
            }
            if (fixtureInstrumentIds.length) {
              await manager
                .getRepository(MarketData)
                .delete({ instrumentId: In(fixtureInstrumentIds) });
              await manager.getRepository(Instrument).delete(fixtureInstrumentIds);
            }
          });
        } finally {
          await appDataSource.destroy();
        }
      }
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

    const instruments = await requestJson(`/instruments?q=${searchToken}&page=1&pageSize=2`);
    expect(instruments.response.status).toBe(200);
    expect(instruments.body.data.length).toBeGreaterThan(0);
    expect(instruments.body.requestId).toEqual(expect.any(String));

    const portfolio = await requestJson(`/users/${testUserId}/portfolio`);
    expect(portfolio.response.status).toBe(200);
    expect(portfolio.body).toMatchObject({ userId: testUserId, currency: 'ARS' });
    expect(portfolio.body.requestId).toEqual(expect.any(String));
  });

  it('creates and cancels a limit order over a real HTTP socket', async () => {
    const creation = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instrumentId,
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: '1.00',
      }),
    });

    expect(creation.response.status).toBe(201);
    expect(creation.body.order.status).toBe('NEW');
    const cancellation = await requestJson(
      `/users/${testUserId}/orders/${creation.body.order.id}/cancel`,
      {
        method: 'PATCH',
      },
    );

    expect(cancellation.response.status).toBe(200);
    expect(cancellation.body.status).toBe('CANCELLED');
    expect(cancellation.body.requestId).toEqual(expect.any(String));
  });

  it('handles order outcomes, input limits, and invalid resources', async () => {
    const buy = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId, side: 'BUY', type: 'MARKET', amount: '25000.00' }),
    });
    expect(buy.response.status).toBe(201);
    expect(buy.body.order.status).toBe('FILLED');
    const rejectedSale = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instrumentId: otherInstrumentId,
        side: 'SELL',
        type: 'MARKET',
        quantity: 999999,
      }),
    });
    expect(rejectedSale.response.status).toBe(201);
    expect(rejectedSale.body).toMatchObject({ rejectionReason: 'INSUFFICIENT_HOLDINGS' });
    const invalidPayload = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instrumentId,
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        amount: '1.00',
      }),
    });
    expect(invalidPayload.response.status).toBe(400);
    expect(invalidPayload.body.error.code).toBe('INVALID_ORDER');

    const oversizedQuantity = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 2147483648 }),
    });
    expect(oversizedQuantity.response.status).toBe(400);

    const unknownInstrument = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instrumentId: 999999, side: 'BUY', type: 'MARKET', quantity: 1 }),
    });
    expect(unknownInstrument.response.status).toBe(404);
  });

  it('returns JSON errors for malformed JSON, unknown routes, and bounded searches', async () => {
    const malformed = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    expect(malformed.response.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    expect(malformed.response.headers.get('x-request-id')).toEqual(expect.any(String));
    expect(malformed.body.requestId).toEqual(expect.any(String));

    const oversizedBody = await requestJson(`/users/${testUserId}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(102_400) }),
    });
    expect(oversizedBody.response.status).toBe(413);
    expect(oversizedBody.response.headers.get('x-request-id')).toEqual(expect.any(String));
    expect(oversizedBody.body.requestId).toEqual(expect.any(String));

    const missing = await requestJson('/missing-route');
    expect(missing.response.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    const shortSearch = await requestJson('/instruments?q=a&page=1&pageSize=20');
    expect(shortSearch.response.status).toBe(400);

    const wildcardSearch = await requestJson('/instruments?q=%25%25&page=1&pageSize=20');
    expect(wildcardSearch.response.status).toBe(200);
    expect(wildcardSearch.body.pagination.total).toBe(0);

    const excessivePage = await requestJson('/instruments?q=gas&page=10001&pageSize=20');
    expect(excessivePage.response.status).toBe(400);

    const invalidUser = await requestJson('/users/0/orders', {
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
    expect(invalidUser.response.status).toBe(400);
    expect(invalidUser.body.error.code).toBe('INVALID_USER_ID');
  });

  it('serializes concurrent market orders for one user', async () => {
    const payload = JSON.stringify({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 60 });
    const [first, second] = await Promise.all([
      requestJson(`/users/${testUserId}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
      requestJson(`/users/${testUserId}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
    ]);

    expect([first.response.status, second.response.status]).toEqual([201, 201]);
    expect([first.body.order.status, second.body.order.status].sort()).toEqual([
      'FILLED',
      'REJECTED',
    ]);
    expect(await portfolio()).toMatchObject({
      availableCash: '400000.00',
      accountTotal: '1000000.00',
      positions: [{ instrumentId, quantity: 60, marketValue: '600000.00' }],
    });
  });

  it('reconciles amount conversion, latest close, successful sale and persisted values', async () => {
    await quote('12500.00'); // Same date, larger ID must win.
    await appDataSource
      .getRepository(MarketData)
      .save({ instrumentId, date: '2025-12-01', close: '1.00', previousClose: '1.00' });
    const buy = await place({ instrumentId, side: 'BUY', type: 'MARKET', amount: '30000.00' });
    expect(buy.response.status).toBe(201);
    expect(buy.body.order).toMatchObject({ quantity: 2, price: '12500.00', status: 'FILLED' });
    expect(
      await appDataSource.getRepository(Order).findOneByOrFail({ id: buy.body.order.id }),
    ).toMatchObject({ size: 2, price: '12500.00', status: 'FILLED' });
    expect(await portfolio()).toMatchObject({
      availableCash: '975000.00',
      accountTotal: '1000000.00',
      positions: [{ quantity: 2, averageCost: '12500.00', marketValue: '25000.00' }],
    });
    const sale = await place({ instrumentId, side: 'SELL', type: 'MARKET', amount: '25000.00' });
    expect(sale.body.order).toMatchObject({ status: 'FILLED', quantity: 2, price: '12500.00' });
    expect(await portfolio()).toMatchObject({
      availableCash: '1000000.00',
      accountTotal: '1000000.00',
      positions: [],
    });
  });

  it('persists both rejection reasons without changing balances', async () => {
    const before = await portfolio();
    for (const [side, quantity, reason] of [
      ['BUY', 101, 'INSUFFICIENT_CASH'],
      ['SELL', 1, 'INSUFFICIENT_HOLDINGS'],
    ] as const) {
      const result = await place({ instrumentId, side, type: 'MARKET', quantity });
      expect(result.response.status).toBe(201);
      expect(result.body.rejectionReason).toBe(reason);
      expect(
        await appDataSource.getRepository(Order).findOneByOrFail({ id: result.body.order.id }),
      ).toMatchObject({ status: 'REJECTED', side, size: quantity });
      const after = await portfolio();
      expect({ ...after, requestId: before.requestId }).toEqual(before);
    }
  });

  it('enforces ownership, terminal states and concurrent cancellation', async () => {
    const pending = await place({
      instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: '1.00',
    });
    const path = `/users/${testUserId}/orders/${pending.body.order.id}/cancel`;
    expect(
      (
        await requestJson(`/users/${otherUserId}/orders/${pending.body.order.id}/cancel`, {
          method: 'PATCH',
        })
      ).response.status,
    ).toBe(404);
    const results = await Promise.all([
      requestJson(path, { method: 'PATCH' }),
      requestJson(path, { method: 'PATCH' }),
    ]);
    expect(results.map((result) => result.response.status).sort()).toEqual([200, 409]);
    expect(
      await appDataSource.getRepository(Order).findOneByOrFail({ id: pending.body.order.id }),
    ).toMatchObject({ status: 'CANCELLED' });
    const cancelled = results.find((result) => result.response.status === 200)!;
    expect(cancelled.body.datetime).toBe(pending.body.order.datetime);
    const filled = await place({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 1 });
    const rejected = await place({ instrumentId, side: 'SELL', type: 'MARKET', quantity: 2 });
    for (const result of [filled, rejected]) {
      expect(
        (
          await requestJson(`/users/${testUserId}/orders/${result.body.order.id}/cancel`, {
            method: 'PATCH',
          })
        ).response.status,
      ).toBe(409);
    }
    expect(
      (await requestJson(`/users/${testUserId}/orders/2147483647/cancel`, { method: 'PATCH' }))
        .response.status,
    ).toBe(404);
  });

  it('prevents concurrent overselling and keeps users independent', async () => {
    await place({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 1 });
    const results = await Promise.all([
      place({ instrumentId, side: 'SELL', type: 'MARKET', quantity: 1 }),
      place({ instrumentId, side: 'SELL', type: 'MARKET', quantity: 1 }),
    ]);
    expect(results.map((result) => result.body.order.status).sort()).toEqual([
      'FILLED',
      'REJECTED',
    ]);
    expect(await portfolio()).toMatchObject({ availableCash: '1000000.00', positions: [] });
    const buys = await Promise.all([
      place({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 100 }),
      place({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 100 }, otherUserId),
    ]);
    expect(buys.map((result) => result.body.order.status)).toEqual(['FILLED', 'FILLED']);
    for (const userId of fixtureUserIds)
      expect(await portfolio(userId)).toMatchObject({
        availableCash: '0.00',
        positions: [{ quantity: 100 }],
      });
  });

  it('validates exact balances, one cent short, sub-share amounts and maximum price', async () => {
    await appDataSource.getRepository(Order).delete({ userId: testUserId });
    await fund(10);
    await quote('10.01');
    expect(
      (await place({ instrumentId, side: 'BUY', type: 'MARKET', quantity: 1 })).body.order.status,
    ).toBe('REJECTED');
    expect(
      (await place({ instrumentId, side: 'BUY', type: 'MARKET', amount: '10.00' })).body.error.code,
    ).toBe('AMOUNT_TOO_LOW');
    await quote('10.00');
    expect(
      (await place({ instrumentId, side: 'BUY', type: 'MARKET', amount: '10.00' })).body.order
        .status,
    ).toBe('FILLED');
    expect(await portfolio()).toMatchObject({
      availableCash: '0.00',
      positions: [{ quantity: 1 }],
    });
    await place({ instrumentId, side: 'SELL', type: 'MARKET', quantity: 1 });
    expect(await portfolio()).toMatchObject({ availableCash: '10.00', positions: [] });
    const maximum = await place({
      instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: '99999999.99',
    });
    expect(maximum.response.status).toBe(201);
    expect(maximum.body.order).toMatchObject({ status: 'REJECTED', price: '99999999.99' });
    expect(
      (
        await place({
          instrumentId,
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1,
          price: '100000000.00',
        })
      ).response.status,
    ).toBe(400);
  });

  it('searches name and ticker with stable pagination, excluding cash', async () => {
    const byName = await requestJson(
      `/instruments?q=${encodeURIComponent(`Review ${searchToken}`)}`,
    );
    const byTicker = await requestJson(`/instruments?q=${searchToken.toUpperCase()}`);
    for (const result of [byName, byTicker]) {
      expect(result.body.data.map((item: { id: number }) => item.id)).toEqual([
        instrumentId,
        otherInstrumentId,
      ]);
      expect(result.body.pagination.total).toBe(2);
    }
    const page1 = await requestJson(`/instruments?q=${searchToken}&pageSize=1`);
    const page2 = await requestJson(`/instruments?q=${searchToken}&pageSize=1&page=2`);
    expect(page1.body.data[0].id).toBe(instrumentId);
    expect(page2.body.data[0].id).toBe(otherInstrumentId);
    expect(
      (await requestJson(`/instruments?q=${searchToken}&pageSize=1&page=3`)).body.data,
    ).toEqual([]);
  });

  it('round-trips the same instant through PostgreSQL in different process time zones', async () => {
    const instant = '2026-10-15T12:00:00.000Z';
    const execute = promisify(execFile);
    for (const timezone of ['UTC', 'America/Argentina/Buenos_Aires']) {
      const script = `
        import { appDataSource as db } from './src/database/data-source.ts';
        import { Order } from './src/database/entities/Order.ts';
        await db.initialize();
        try {
          const row=await db.getRepository(Order).save({userId:${testUserId},instrumentId:${cashInstrumentId},side:'CASH_IN',type:'MARKET',status:'FILLED',size:1,price:null,datetime:new Date('${instant}')});
          const loaded=await db.getRepository(Order).findOneByOrFail({id:row.id});
          console.log(JSON.stringify({id:row.id,datetime:loaded.datetime.toISOString()}));
        } finally {await db.destroy();}
      `;
      const { stdout } = await execute(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', script],
        { env: { ...process.env, TZ: timezone }, timeout: 20000 },
      );
      const result = JSON.parse(stdout.trim());
      expect(result.datetime).toBe(instant);
      const fromParent = await appDataSource
        .getRepository(Order)
        .findOneByOrFail({ id: result.id });
      expect(fromParent.datetime.toISOString()).toBe(instant);
    }
  }, 60000);
});
