import type { Server } from 'node:http';

import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

let server: Server | undefined;

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

describe('runtime endpoints', () => {
  it('returns 503 when the database readiness check fails', async () => {
    const app = createApp({
      query: async () => Promise.reject(new Error('database offline')),
      getRepository: () => ({}),
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
