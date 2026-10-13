import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { appDataSource } from '../src/database/data-source.js';

const app = createApp(appDataSource);

describe('read API', () => {
  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  it('searches instruments by ticker or name', async () => {
    const response = await request(app)
      .get('/instruments?q=gas&page=1&pageSize=20')
      .expect(200);

    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 20 });
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.every((instrument: { type: string }) => instrument.type !== 'MONEDA')).toBe(true);
  });

  it('returns a portfolio for an existing user', async () => {
    const response = await request(app)
      .get('/users/1/portfolio')
      .expect(200);

    expect(response.body).toMatchObject({ userId: 1, currency: 'ARS' });
    expect(response.body).toHaveProperty('availableCash');
    expect(response.body).toHaveProperty('accountTotal');
    expect(Array.isArray(response.body.positions)).toBe(true);
  });
});
