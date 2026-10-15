import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import pino from 'pino';

import { createApp } from '../src/app.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function start(repository = {}, commit: string | null = null) {
  const lines: string[] = [];
  const logger = pino(
    { level: 'info' },
    {
      write: (line: string) => {
        lines.push(line);
      },
    },
  );
  const app = createApp({ getRepository: () => repository } as never, logger, commit);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server!.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return { url: `http://127.0.0.1:${address.port}`, lines };
}

describe('runtime endpoints', () => {
  it.each([null, 'a'.repeat(40)])('exposes the deployed commit in health (%s)', async (commit) => {
    const { url } = await start({}, commit);
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      commit,
      requestId: expect.any(String),
    });
  });
  it('omits secrets from request logs while retaining correlation', async () => {
    const { url, lines } = await start();
    const response = await fetch(`${url}/health?token=SECRET_SENTINEL`, {
      headers: {
        authorization: 'Bearer SECRET_SENTINEL',
        cookie: 'session=SECRET_SENTINEL',
        'x-api-key': 'SECRET_SENTINEL',
        'x-request-id': 'safe-id',
      },
    });
    await response.json();
    expect(lines.join('')).not.toContain('SECRET_SENTINEL');
    expect(lines.join('')).toContain('safe-id');
    expect(lines.join('')).toContain('/health');
  });

  it.each(['2147483648', '9007199254740993', '1.5', '0', '-1'])(
    'rejects out-of-range user and order IDs (%s) before database access',
    async (value) => {
      const { url } = await start();
      for (const path of [
        `/users/${value}/portfolio`,
        `/users/${value}/orders/1/cancel`,
        `/users/1/orders/${value}/cancel`,
      ]) {
        const response = await fetch(`${url}${path}`, {
          method: path.endsWith('cancel') ? 'PATCH' : 'GET',
        });
        expect(response.status).toBe(400);
      }
      const response = await fetch(`${url}/users/1/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instrumentId: Number(value),
          side: 'BUY',
          type: 'MARKET',
          quantity: 1,
        }),
      });
      expect(response.status).toBe(400);
    },
  );

  it('preserves unsupported charset and content encoding as 415', async () => {
    const { url } = await start();
    for (const headers of [
      { 'content-type': 'application/json; charset=ISO-8859-1' },
      { 'content-type': 'application/json', 'content-encoding': 'unsupported' },
    ]) {
      const response = await fetch(`${url}/users/1/orders`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
        requestId: expect.any(String),
      });
    }
  });

  it('returns 503 for database connection failures in business routes without logging driver secrets', async () => {
    const { url, lines } = await start({
      findOneBy: async () => {
        throw Object.assign(new Error('SECRET_SENTINEL'), { code: 'ECONNREFUSED' });
      },
    });
    const response = await fetch(`${url}/users/1/portfolio`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    expect(lines.join('')).not.toContain('SECRET_SENTINEL');
  });

  it('returns 503 when the database readiness check fails', async () => {
    const app = createApp({
      getRepository: () => ({ exists: async () => Promise.reject(new Error('database offline')) }),
    } as never);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Could not resolve test server address');

    const response = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'DATABASE_UNAVAILABLE' },
    });
  });
});
