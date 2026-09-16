import { expect, test } from '@playwright/test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { CRMData } from '../shared/crm.ts';
import { createApp } from '../server/app.ts';
import { Store } from '../server/store.ts';

test('direct workspace access opens without an account and survives refresh', async ({ page }, testInfo) => {
  const store = new Store();
  const server = createApp(store, {
    production: false,
    demoMode: false,
    authDisabled: true,
    appOrigin: 'http://127.0.0.1:5175',
    cookieSecure: false,
    trustProxy: false,
    webhookSecret: '',
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    await page.route('**/api/**', async (route) => {
      const upstream = new URL(route.request().url());
      upstream.port = String(port);
      await route.fulfill({ response: await route.fetch({ url: upstream.toString() }) });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    await expect(page.locator('.demo-badge')).toHaveCount(0);
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Shared workspace Administrator' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.goto('/team');
    await page.getByRole('button', { name: 'Add member', exact: true }).click();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByLabel('Full name').fill('New teammate');
    await page.getByLabel('Work email').fill('teammate@example.test');
    await page.getByRole('dialog').getByRole('button', { name: 'Add member', exact: true }).click();
    await expect(page.getByRole('cell', { name: /New teammate/ })).toBeVisible();
    expect(store.get<{ count: number }>('SELECT COUNT(*) AS count FROM sessions')?.count).toBe(0);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});

test('overview, search and navigation show real workspace data', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.locator('.metrics-grid .metric')).toHaveCount(4);
  await expect(page.locator('.metric-value').nth(1)).toHaveText('$38,700');
  await expect(page.locator('.pipeline-summary-stage')).toHaveCount(6);
  await page.getByTitle('Search workspace (Ctrl+K)').click();
  await page.getByRole('combobox', { name: 'Search workspace' }).fill('Olivia');
  await page.getByRole('option').filter({ hasText: 'Olivia Bennett' }).click();
  await expect(page.getByRole('heading', { name: 'Form & Field', exact: true })).toBeVisible();
  await page.getByTitle('Search workspace (Ctrl+K)').click();
  await page.getByRole('combobox', { name: 'Search workspace' }).fill('phased approach');
  await page.getByRole('option').filter({ hasText: 'Form & Field' }).click();
  await expect(page.locator('.note-card').filter({ hasText: 'phased approach' })).toBeVisible();
  await page.goto('/pipeline');
  await expect(page.locator('.pipeline-column')).toHaveCount(4);
  await page.getByRole('button', { name: /^Lost/ }).click();
  await expect(page.locator('.pipeline-column')).toHaveCount(1);
  await expect(page.locator('.pipeline-card')).toHaveCount(2);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Goatara' })).toBeVisible();
    await page.getByRole('dialog').getByRole('link', { name: 'Onboarding', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Client onboarding' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('one company keeps its notes, contacts and tasks through conversion and onboarding', async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Continuity ${suffix}`;
  const firstNote = `Discovery history ${suffix}. Keep the original enquiry and next steps.`;
  const secondNote = `Second call ${suffix}. Ready to sign the agreement.`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New company', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'New company', exact: true });
  await createDialog.getByLabel('Business name').fill(name);
  await createDialog.getByLabel('Full name').fill('Taylor Jordan');
  await createDialog.getByLabel('Email', { exact: true }).fill(`taylor-${suffix}@example.test`);
  await createDialog.getByLabel('Phone', { exact: true }).fill('+1 415 555 0100');
  await createDialog
    .getByLabel('Link to your store, listings, or products')
    .fill(`https://${suffix}.example.test/products`);
  await createDialog.getByLabel('Where are you at right now?').fill('An established store');
  await createDialog.getByLabel('What do you sell?').fill('Home goods');
  await createDialog.getByLabel('Roughly how many products?').fill('25-50');
  await createDialog.getByLabel('Current monthly revenue across all channels').fill('$25k-$50k');
  await createDialog.getByLabel('How would orders get shipped?').fill('Third-party fulfillment');
  await createDialog.getByLabel('When would you want to start?').fill('Next month');
  await createDialog.getByLabel('Monthly retainer (USD)').fill('3200');
  await createDialog.getByRole('button', { name: 'Create company', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const companyId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Log a call', exact: true }).click();
  await page.getByRole('textbox', { name: 'Write a note' }).fill(firstNote);
  await expect(page.getByText('Draft saved in this tab')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Write a note' })).toHaveValue(firstNote);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.note-card').filter({ hasText: firstNote })).toBeVisible();
  await page.getByRole('textbox', { name: 'Write a note' }).fill(secondNote);
  await page.getByRole('textbox', { name: 'Write a note' }).press('Control+Enter');
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page
    .locator('.note-card')
    .filter({ hasText: firstNote })
    .getByRole('button', { name: 'Pin note', exact: true })
    .click();
  await expect(page.locator('.note-card.pinned')).toContainText(firstNote);
  await page.getByLabel('Sales stage', { exact: true }).selectOption('won');
  await expect(page.getByLabel('Client status', { exact: true })).toHaveValue('onboarding');
  expect(new URL(page.url()).pathname).toBe(`/companies/${companyId}`);
  await expect(page.locator('.note-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const taskDialog = page.getByRole('dialog', { name: 'New task', exact: true });
  await taskDialog.getByRole('textbox', { name: /^Task/ }).fill(`Follow up ${suffix}`);
  await taskDialog.getByLabel('Contact', { exact: true }).selectOption({ label: 'Taylor Jordan' });
  await taskDialog.getByLabel('Due date').fill('2026-09-20');
  await taskDialog.getByLabel('Priority').selectOption('high');
  await taskDialog.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(taskDialog).not.toBeVisible();
  await page.getByRole('tab', { name: /^Tasks/ }).click();
  await page.getByRole('button', { name: `Complete Follow up ${suffix}`, exact: true }).click();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('button', { name: `Reopen Follow up ${suffix}`, exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Onboarding', exact: true }).click();
  await expect(page.locator('.checklist-item')).toHaveCount(12);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const itemDialog = page.getByRole('dialog', { name: 'Add onboarding item' });
  await itemDialog.getByLabel('Item name').fill('TikTok Ads access');
  await itemDialog.getByLabel('Category').selectOption('access');
  await itemDialog.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('TikTok Ads access status', { exact: true }).selectOption('not_required');
  await expect(page.getByLabel('TikTok Ads access status', { exact: true })).toHaveValue('not_required');
  const required = page
    .locator('.checklist-item')
    .filter({ hasNotText: 'TikTok Ads access' })
    .getByRole('combobox');
  for (let index = 0; index < 12; index++) {
    await required.nth(index).selectOption('received');
    await expect(required.nth(index)).toHaveValue('received');
  }
  await page.getByRole('button', { name: 'Activate client', exact: true }).click();
  await expect(page.getByLabel('Client status', { exact: true })).toHaveValue('active');
  const data = (await (await page.request.get('/api/workspace')).json()) as CRMData;
  const company = data.companies.find((item) => item.id === companyId)!;
  expect(data.companies.filter((item) => item.name === name)).toHaveLength(1);
  expect(company.stage).toBe('won');
  expect(company.products).toBe('Home goods');
  expect(company.monthlyRevenue).toBe('$25k-$50k');
  expect(data.notes.filter((note) => note.companyId === companyId)).toHaveLength(2);
  expect(data.tasks.find((task) => task.companyId === companyId)?.completedAt).toBeTruthy();
  expect(data.contacts.find((contact) => contact.companyId === companyId)?.name).toBe('Taylor Jordan');
  await page.reload();
  await expect(page.getByLabel('Client status', { exact: true })).toHaveValue('active');
});

test('authenticated website submissions appear in the same company with their original fields', async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const input = {
    businessName: `Intake ${suffix}`,
    fullName: 'Jordan Lee',
    email: `intake-${suffix}@example.test`,
    phone: '+1 555 010 4321',
    storeUrl: `https://intake-${suffix}.example.test`,
    currentSituation: 'Starting a new store',
    products: 'Accessories',
    productCount: '10-20',
    monthlyRevenue: '$10k',
    shippingMethod: 'Warehouse partner',
    desiredStart: 'November',
  };
  const headers = {
    authorization: 'Bearer e2e-only-webhook-secret-with-more-than-32-characters',
    'idempotency-key': suffix,
  };
  const first = await request.post('/api/intake/leads', { headers, data: input });
  expect(first.status()).toBe(201);
  const { companyId } = (await first.json()) as { companyId: string };
  expect((await request.post('/api/intake/leads', { headers, data: input })).status()).toBe(200);
  await page.goto(`/companies/${companyId}`);
  await expect(page.getByRole('heading', { name: input.businessName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Submission history/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Website enquiries' });
  await expect(dialog.locator('.submission-record')).toHaveCount(1);
  for (const [key, field] of Object.entries(input))
    await expect(
      dialog
        .locator('.submission-record')
        .getByText(key === 'storeUrl' ? new URL(field).href : field, { exact: true }),
    ).toBeVisible();
});

test('saving a call note preserves text typed while the request is in flight', async ({ page }) => {
  await page.goto('/companies');
  await page.getByRole('textbox', { name: 'Search companies and contacts' }).fill('Olivia');
  await page
    .locator('tbody')
    .getByRole('link', { name: /Form & Field form-field/ })
    .click();
  await page.getByRole('button', { name: 'Log a call', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Write a note' });
  await composer.fill('First part of the call.');
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/companies/*/notes', async (route) => {
    await pending;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save note', exact: true })).toBeDisabled();
  await composer.fill('First part of the call. A new decision while saving.');
  release();
  await expect(page.locator('.note-card').filter({ hasText: 'First part of the call.' })).toBeVisible();
  await expect(composer).toHaveValue('First part of the call. A new decision while saving.');
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(composer).toHaveValue('');
});

test('workspace layouts, assets and controls fit desktop and mobile', async ({ page }, testInfo) => {
  for (const route of [
    '/',
    '/pipeline',
    '/companies',
    '/tasks',
    '/onboarding',
    '/notes',
    '/team',
    '/settings',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const layout = await page.evaluate(() => ({
      overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      invalidButtons: [...document.querySelectorAll<HTMLButtonElement>('.button')]
        .filter((button) => button.offsetWidth > 0 && button.scrollWidth > button.clientWidth + 2)
        .map((button) => button.textContent),
      brokenImages: [...document.images]
        .filter((image) => image.offsetWidth > 0 && (!image.complete || image.naturalWidth === 0))
        .map((image) => image.src),
    }));
    expect(layout, route).toEqual({ overflowing: false, invalidButtons: [], brokenImages: [] });
    if (['/', '/pipeline', '/onboarding'].includes(route))
      await page.screenshot({
        path: testInfo.outputPath(`${route === '/' ? 'overview' : route.slice(1)}.png`),
        fullPage: true,
        animations: 'disabled',
      });
  }
  await page.goto('/companies');
  await page.getByRole('textbox', { name: 'Search companies and contacts' }).fill('Olivia');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page
    .locator('tbody')
    .getByRole('link', { name: /Form & Field form-field/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Form & Field', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('company-profile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Edit company', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit company', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('company-form.png'), animations: 'disabled' });
});
