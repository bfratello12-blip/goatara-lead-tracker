import { createApp } from './app.ts';
import { Store } from './store.ts';
import { PostgresStore } from './postgres-store.ts';
import { runtimeConfig } from './config.ts';
import { seedDemo } from './seed.ts';

const { config, host, port, databasePath, supabaseDbUrl } = runtimeConfig();
const store = config.production ? new PostgresStore(supabaseDbUrl) : new Store(databasePath);
if (config.demoMode && store instanceof Store) seedDemo(store);
const app = createApp(store, config);
const server = app.listen(port, host, async () => {
  console.log(
    `Goatara API: http://${host}:${port} (${config.demoMode ? 'local demo workspace' : config.authDisabled ? 'direct-access workspace' : 'authenticated workspace'})`,
  );
  if (!config.demoMode && !config.authDisabled && !(await store.hasUsers()))
    console.log('No team accounts yet. Run npm run user:create in another terminal.');
});
server.on('error', (error) => {
  console.error(error.message);
  void store.close();
  process.exitCode = 1;
});
function shutdown() {
  server.close(() => {
    void store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
