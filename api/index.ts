import { createApp } from '../server/app.ts';
import { runtimeConfig } from '../server/config.ts';
import { PostgresStore } from '../server/postgres-store.ts';

const { config, supabaseDbUrl } = runtimeConfig({ serverless: true });
const store = new PostgresStore(supabaseDbUrl);
const app = createApp(store, config);

export default app;
