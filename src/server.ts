import { env } from './config/env.js';
import { appDataSource } from './database/data-source.js';
import { createApp } from './app.js';

await appDataSource.initialize();

const app = createApp(appDataSource);

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});
