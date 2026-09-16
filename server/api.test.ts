import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { Store } from './store.ts';
import { createUser, type AppConfig } from './auth.ts';
import { runtimeConfig } from './config.ts';

const config: AppConfig = {
  production: false,
  demoMode: false,
  appOrigin: 'http://localhost:5173',
  cookieSecure: false,
  trustProxy: false,
  webhookSecret: 'test-only-webhook-secret-that-is-long-enough',
};

test('Vercel manual leads accept exact configured origins and reject unrelated origins', async (testContext) => {
  const previous = { ...process.env };
  let deploymentConfig: AppConfig;
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      AUTH_DISABLED: 'true',
      COOKIE_SECURE: 'true',
      APP_ORIGIN: 'https://crm.example.test',
      VERCEL: '1',
      VERCEL_URL: 'crm-build-123.vercel.app',
      VERCEL_BRANCH_URL: 'crm-git-main.vercel.app',
      SUPABASE_DB_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
    });
    deploymentConfig = runtimeConfig({ serverless: true }).config;
    assert.deepEqual(runtimeConfig().config.deploymentOrigins, []);
    process.env.VERCEL = '0';
    assert.deepEqual(runtimeConfig({ serverless: true }).config.deploymentOrigins, []);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
  const store = new Store();
  const server = createApp(store, deploymentConfig).listen(0, '127.0.0.1');
  await once(server, 'listening');
  testContext.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/companies`;
  for (const origin of [deploymentConfig.appOrigin, ...deploymentConfig.deploymentOrigins!]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ businessName: 'Manual lead' }),
    });
    assert.equal(response.status, 201);
  }
  for (const origin of [
    '',
    'null',
    'https://other.vercel.app',
    'https://crm-build-123.vercel.app.evil.test',
    'http://crm-build-123.vercel.app',
  ]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-host': 'crm-build-123.vercel.app' },
      body: JSON.stringify({ businessName: 'Denied' }),
    });
    assert.equal(response.status, 403);
  }
  assert.equal(store.snapshot().companies.length, 3);
});

test('private API enforces authentication, origin and CSRF while allowing authenticated workflows', async (testContext) => {
  const store = new Store();
  createUser(store, {
    name: 'Test Admin',
    email: 'admin@example.test',
    password: 'test-only-password-123',
    role: 'admin',
  });
  const server = createApp(store, config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  testContext.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const anonymous = await fetch(`${base}/api/workspace`);
  assert.equal(anonymous.status, 401);
  const wrongOrigin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'test-only-password-123' }),
  });
  assert.equal(wrongOrigin.status, 403);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: config.appOrigin },
    body: JSON.stringify({ email: 'admin@example.test', password: 'test-only-password-123' }),
  });
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.get('set-cookie')!;
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const cookie = cookieHeader.split(';')[0];
  const session = (await login.json()) as { csrfToken: string; user: Record<string, unknown> };
  assert.equal('passwordHash' in session.user, false);
  const headers = {
    'content-type': 'application/json',
    origin: config.appOrigin,
    cookie,
    'x-csrf-token': session.csrfToken,
  };
  const noCsrf = await fetch(`${base}/api/companies`, {
    method: 'POST',
    headers: { ...headers, 'x-csrf-token': '' },
    body: JSON.stringify({ businessName: 'Denied' }),
  });
  assert.equal(noCsrf.status, 403);
  const created = await fetch(`${base}/api/companies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      businessName: 'Private company',
      fullName: 'Jordan',
      email: 'jordan@example.test',
    }),
  });
  assert.equal(created.status, 201);
  const company = (await created.json()) as { id: string };
  const won = await fetch(`${base}/api/companies/${company.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ stage: 'won' }),
  });
  assert.equal(won.status, 200);
  const note = await fetch(`${base}/api/companies/${company.id}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'call', content: 'Call notes are private' }),
  });
  assert.equal(note.status, 201);
  assert.equal(store.snapshot().onboarding.length, 12);
  const workspace = await fetch(`${base}/api/workspace`, { headers: { cookie } });
  assert.equal(workspace.headers.get('cache-control'), 'no-store');
  assert.equal((await workspace.text()).includes('passwordHash'), false);
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${base}/api/workspace`, { headers: { cookie } })).status, 401);
});

test('direct access opens an empty workspace and saves without a login or CSRF token', async (testContext) => {
  const store = new Store();
  const server = createApp(store, { ...config, authDisabled: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  testContext.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const sessions = await Promise.all([fetch(`${base}/auth/me`), fetch(`${base}/auth/me`)]);
  for (const response of sessions) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    const session = (await response.json()) as { user: { id: string; name: string }; csrfToken: string };
    assert.equal(session.user.name, 'Shared workspace');
    assert.equal(session.csrfToken, '');
  }
  const headers = { 'content-type': 'application/json', origin: config.appOrigin };
  const created = await fetch(`${base}/companies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ businessName: 'Direct company' }),
  });
  assert.equal(created.status, 201);
  const company = (await created.json()) as { id: string };
  const note = await fetch(`${base}/companies/${company.id}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'note', content: 'Shared update' }),
  });
  assert.equal(note.status, 201);
  assert.equal(store.snapshot().team.length, 1);
  assert.equal(store.snapshot().notes[0].authorId, 'user-workspace');
  assert.equal((await fetch(`${base}/workspace`)).status, 200);
  assert.equal(
    (
      await fetch(`${base}/companies`, {
        method: 'POST',
        headers: { ...headers, origin: 'https://untrusted.example' },
        body: JSON.stringify({ businessName: 'Denied' }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/intake/leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ businessName: 'Denied' }),
      })
    ).status,
    401,
  );
});

test('intake is server-authenticated, idempotent and does not expose private company information', async (testContext) => {
  const store = new Store();
  const server = createApp(store, config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  testContext.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/intake/leads`;
  const body = JSON.stringify({
    businessName: 'Website lead',
    fullName: 'Taylor',
    email: 'taylor@example.test',
  });
  assert.equal(
    (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status,
    401,
  );
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${config.webhookSecret}`,
    'idempotency-key': 'submission-123',
  };
  const first = await fetch(url, { method: 'POST', headers, body });
  assert.equal(first.status, 201);
  assert.deepEqual(Object.keys((await first.json()) as object).sort(), ['companyId', 'created', 'replayed']);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal(store.snapshot().companies.length, 1);
  assert.equal(store.snapshot().submissions.length, 1);
});

test('production cannot start with the demo authentication bypass', () => {
  const store = new Store();
  try {
    assert.throws(() => createApp(store, { ...config, production: true, demoMode: true }), /Demo mode/);
  } finally {
    store.close();
  }
});
