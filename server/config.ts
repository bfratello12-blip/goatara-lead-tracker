import type { AppConfig } from './auth.ts';

export function runtimeConfig() {
  const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  const demoMode = process.env.DEMO_MODE === 'true' || (!production && process.env.DEMO_MODE === undefined);
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535');
  if (demoMode && (production || !['127.0.0.1', 'localhost', '::1'].includes(host)))
    throw new Error('Demo mode is only allowed on a local development server');
  const appOrigin = new URL(
    process.env.APP_ORIGIN ?? (production ? `http://localhost:${port}` : 'http://localhost:5173'),
  ).origin;
  const cookieSecure =
    process.env.COOKIE_SECURE === 'true' || (production && process.env.COOKIE_SECURE !== 'false');
  if (production && !cookieSecure)
    throw new Error('Production requires secure cookies. Set COOKIE_SECURE=true and use HTTPS.');
  if (production && !appOrigin.startsWith('https://'))
    throw new Error('Set APP_ORIGIN to the public HTTPS origin before starting production');
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? '';
  if (production && !supabaseDbUrl)
    throw new Error('Production requires SUPABASE_DB_URL. Apply the Supabase migration before starting.');
  const config: AppConfig = {
    production,
    demoMode,
    appOrigin,
    cookieSecure,
    trustProxy: process.env.TRUST_PROXY === 'true',
    webhookSecret: process.env.LEAD_WEBHOOK_SECRET ?? '',
  };
  return {
    config,
    host,
    port,
    databasePath:
      process.env.DATABASE_PATH ?? (demoMode ? 'data/goatara-demo.sqlite' : 'data/goatara.sqlite'),
    supabaseDbUrl,
  };
}
