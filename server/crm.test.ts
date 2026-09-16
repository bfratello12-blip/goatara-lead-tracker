import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transitionCompany, type Company } from '../shared/crm.ts';
import { Store, websiteKey } from './store.ts';
import { backupDatabase } from './backup.ts';
import { runtimeConfig } from './config.ts';
import { createCompanySchema, leadSchema, parseWebsiteLead } from '../shared/validation.ts';

const prospect: Company = {
  id: 'company-1',
  name: 'Northline Goods',
  stage: 'proposal',
  clientStatus: null,
  ownerId: null,
  dealValue: 3500,
  currency: 'USD',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  clientSince: null,
  followUpAt: null,
  expectedCloseAt: null,
  lostReason: null,
  tags: [],
  color: 'green',
  currentSituation: 'Growing an existing store',
  storeUrl: 'https://example.com',
  products: 'Home goods',
  productCount: '20-50',
  monthlyRevenue: '$25k-$50k',
  shippingMethod: 'Third-party fulfillment',
  desiredStart: 'Next month',
};

test('winning keeps the company identity and lead details while starting the client lifecycle', () => {
  const won = transitionCompany(prospect, 'won', '2026-02-01T12:00:00.000Z');
  assert.equal(won.id, prospect.id);
  assert.equal(won.createdAt, prospect.createdAt);
  assert.equal(won.storeUrl, prospect.storeUrl);
  assert.equal(won.monthlyRevenue, prospect.monthlyRevenue);
  assert.equal(won.clientStatus, 'onboarding');
  assert.equal(won.clientSince, '2026-02-01');
  assert.equal(prospect.stage, 'proposal');
});

test('repeated wins preserve the original client start date and status', () => {
  const active = {
    ...prospect,
    stage: 'won' as const,
    clientStatus: 'active' as const,
    clientSince: '2026-02-01',
  };
  const won = transitionCompany(active, 'won', '2026-03-01T12:00:00.000Z');
  assert.equal(won.clientSince, '2026-02-01');
  assert.equal(won.clientStatus, 'active');
});

test('client retention is managed through client status, not by losing the original deal', () => {
  const active = { ...prospect, stage: 'won' as const, clientStatus: 'active' as const };
  assert.throws(() => transitionCompany(active, 'lost', '2026-03-01T12:00:00.000Z'), /client status/);
});

function testStore() {
  const store = new Store();
  store.insert('users', {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.test',
    role: 'admin',
    color: 'green',
    passwordHash: null,
    createdAt: new Date().toISOString(),
  });
  return store;
}

test('conversion preserves notes, tasks, contacts and creates onboarding exactly once', () => {
  const store = testStore();
  try {
    const company = store.createCompany(
      createCompanySchema.parse({
        businessName: 'Example',
        fullName: 'Jordan',
        email: 'jordan@example.test',
      }),
      'owner',
    );
    store.addNote(company.id, { content: 'Keep this call history', kind: 'call' }, 'owner');
    store.addTask(
      {
        companyId: company.id,
        title: 'Follow up',
        dueAt: null,
        contactId: null,
        assigneeId: 'owner',
        priority: 'high',
      },
      'owner',
    );
    store.updateCompany(company.id, { stage: 'won' }, 'owner');
    store.updateCompany(company.id, { stage: 'won' }, 'owner');
    const data = store.snapshot();
    assert.equal(data.companies.length, 1);
    assert.equal(data.companies[0].id, company.id);
    assert.equal(data.notes[0].companyId, company.id);
    assert.equal(data.tasks[0].companyId, company.id);
    assert.equal(data.contacts[0].companyId, company.id);
    assert.equal(data.onboarding.length, 12);
  } finally {
    store.close();
  }
});

test('website intake preserves every form field and tolerates optional missing values', () => {
  const store = testStore();
  try {
    const input = leadSchema.parse({
      businessName: 'Northline',
      fullName: 'Jordan Lee',
      email: 'jordan@northline.test',
      phone: '+1 555 123 4567',
      currentSituation: 'Already selling',
      storeUrl: 'https://northline.test',
      products: 'Outdoor gear',
      productCount: '50-100',
      monthlyRevenue: '$50k',
      shippingMethod: 'In-house',
      desiredStart: 'October',
    });
    const first = store.ingestLead(input, 'submission-1');
    const second = store.ingestLead(
      leadSchema.parse({ businessName: 'Northline', email: 'JORDAN@northline.test' }),
      'submission-2',
    );
    assert.equal(second.company.id, first.company.id);
    assert.equal(second.company.products, 'Outdoor gear');
    assert.deepEqual(store.snapshot().submissions.find((item) => item.payload.phone)?.payload, input);
    assert.equal(store.snapshot().contacts[0].phone, '+1 555 123 4567');
    const sparse = store.ingestLead(leadSchema.parse({ businessName: 'No website yet' }), null);
    assert.equal(sparse.company.storeUrl, null);
  } finally {
    store.close();
  }
});

test('retrying the same webhook is idempotent and changed payloads cannot reuse its key', () => {
  const store = testStore();
  try {
    const input = leadSchema.parse({ businessName: 'Example', email: 'hello@example.test' });
    store.ingestLead(input, 'key');
    assert.equal(store.ingestLead(input, 'key').replayed, true);
    assert.equal(store.snapshot().submissions.length, 1);
    assert.throws(
      () => store.ingestLead({ ...input, businessName: 'Different' }, 'key'),
      /different submission/,
    );
    assert.equal(store.snapshot().companies.length, 1);
  } finally {
    store.close();
  }
});

test('a returning client enquiry never resets their sales or client status', () => {
  const store = testStore();
  try {
    const input = leadSchema.parse({
      businessName: 'Example',
      email: 'hello@example.test',
      storeUrl: 'https://example.test',
    });
    const { company } = store.ingestLead(input, null);
    store.updateCompany(company.id, { stage: 'won' }, 'owner');
    store.updateCompany(company.id, { clientStatus: 'active' }, 'owner');
    const next = store.ingestLead({ ...input, monthlyRevenue: '$100k' }, null);
    assert.equal(next.company.id, company.id);
    assert.equal(next.company.stage, 'won');
    assert.equal(next.company.clientStatus, 'active');
    assert.equal(next.company.monthlyRevenue, '$100k');
  } finally {
    store.close();
  }
});

test('ambiguous email and website matches cannot silently merge companies', () => {
  const store = testStore();
  try {
    store.ingestLead(
      leadSchema.parse({ businessName: 'One', email: 'one@example.test', storeUrl: 'https://one.test' }),
      null,
    );
    store.ingestLead(
      leadSchema.parse({ businessName: 'Two', email: 'two@example.test', storeUrl: 'https://two.test' }),
      null,
    );
    assert.throws(
      () =>
        store.ingestLead(
          leadSchema.parse({
            businessName: 'Conflict',
            email: 'one@example.test',
            storeUrl: 'https://two.test',
          }),
          null,
        ),
      /multiple companies/,
    );
    assert.equal(store.snapshot().submissions.length, 2);
  } finally {
    store.close();
  }
});

test('shared marketplace hosts do not combine unrelated sellers', () => {
  assert.notEqual(websiteKey('https://www.etsy.com/shop/first'), websiteKey('https://etsy.com/shop/second'));
  assert.equal(websiteKey('https://etsy.com/'), null);
  assert.equal(websiteKey('https://www.example.test/products/one'), websiteKey('https://example.test'));
});

test('task contacts must belong to the linked company', () => {
  const store = testStore();
  try {
    const first = store.createCompany(
      createCompanySchema.parse({ businessName: 'One', fullName: 'Contact' }),
      'owner',
    );
    const second = store.createCompany(createCompanySchema.parse({ businessName: 'Two' }), 'owner');
    const contact = store.snapshot().contacts.find((item) => item.companyId === first.id)!;
    assert.throws(
      () =>
        store.addTask(
          {
            companyId: second.id,
            contactId: contact.id,
            title: 'Invalid link',
            assigneeId: null,
            dueAt: null,
            priority: 'normal',
          },
          'owner',
        ),
      /belong to this company/,
    );
    assert.equal(store.snapshot().tasks.length, 0);
  } finally {
    store.close();
  }
});

test('notes remain separate historical entries and primary contacts remain unique', () => {
  const store = testStore();
  try {
    const company = store.createCompany(
      createCompanySchema.parse({ businessName: 'Example', fullName: 'Original' }),
      'owner',
    );
    store.addContact(
      company.id,
      { name: 'New primary', email: null, phone: null, title: null, isPrimary: true },
      'owner',
    );
    store.addNote(company.id, { content: 'First note', kind: 'note' }, 'owner');
    store.addNote(company.id, { content: 'Second note', kind: 'call' }, 'owner');
    const data = store.snapshot();
    assert.equal(data.contacts.filter((contact) => contact.isPrimary).length, 1);
    assert.equal(data.notes.length, 2);
    assert.ok(
      data.notes.every(
        (note) => note.authorId === 'owner' && note.createdAt && note.companyId === company.id,
      ),
    );
  } finally {
    store.close();
  }
});

test('dates and website protocols are validated without accepting tracking fields', () => {
  assert.equal(
    createCompanySchema.safeParse({ businessName: 'Example', followUpAt: '2026-02-31' }).success,
    false,
  );
  assert.equal(
    leadSchema.safeParse({ businessName: 'Example', storeUrl: 'javascript://alert(1)' }).success,
    false,
  );
  assert.equal('utm_source' in leadSchema.parse({ businessName: 'Example', utm_source: 'ignored' }), false);
});

test('current goatara.com contact form fields normalize into the CRM lead contract', () => {
  const lead = parseWebsiteLead({
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan@example.test',
    phone: '',
    whereDoYouSellToday: 'Amazon and local retail',
    tellUsAboutProducts: 'Outdoor equipment',
    utm_source: 'must be discarded',
  });
  assert.equal(lead.businessName, 'Unconfirmed - Jordan Lee');
  assert.equal(lead.fullName, 'Jordan Lee');
  assert.equal(lead.currentSituation, 'Amazon and local retail');
  assert.equal(lead.products, 'Outdoor equipment');
  assert.equal('utm_source' in lead, false);
});

test('companies survive reopening the database and online backups retain committed history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'goatara-crm-test-'));
  const source = join(directory, 'workspace.sqlite');
  const destination = join(directory, 'backup.sqlite');
  let store = new Store(source);
  try {
    store.insert('users', {
      id: 'owner',
      name: 'Owner',
      email: 'owner@example.test',
      role: 'admin',
      color: 'green',
      passwordHash: null,
      createdAt: new Date().toISOString(),
    });
    const company = store.createCompany(
      createCompanySchema.parse({ businessName: 'Persistent company' }),
      'owner',
    );
    store.addNote(company.id, { content: 'Persistent history', kind: 'call' }, 'owner');
    await backupDatabase(source, destination);
    await assert.rejects(() => backupDatabase(source, destination), /will not be overwritten/);
    store.close();
    store = new Store(source);
    assert.equal(store.company(company.id).name, 'Persistent company');
    const restored = new Store(destination);
    try {
      assert.equal(restored.company(company.id).id, company.id);
      assert.equal(restored.snapshot().notes[0].content, 'Persistent history');
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production configuration requires a Supabase Postgres connection', () => {
  const previous = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'false';
    process.env.APP_ORIGIN = 'https://crm.example.test';
    process.env.COOKIE_SECURE = 'true';
    delete process.env.SUPABASE_DB_URL;
    assert.throws(() => runtimeConfig(), /SUPABASE_DB_URL/);
    process.env.SUPABASE_DB_URL = 'postgres://user:password@example.test:6543/postgres';
    assert.equal(runtimeConfig().config.production, true);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
