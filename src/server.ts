import { env } from './config/env.js';
import { appDataSource } from './database/data-source.js';
import { createApp } from './app.js';
import pino from 'pino';

await appDataSource.initialize();

const logger = pino({ level: env.LOG_LEVEL });
const app = createApp(appDataSource, logger);

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});
