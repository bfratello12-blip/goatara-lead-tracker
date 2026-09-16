import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transitionCompany, type Company } from '../shared/crm.ts';
import { Store, websiteKey } from './store.ts';
import { PostgresStore } from './postgres-store.ts';
import postgres, { type TransactionSql } from 'postgres';
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

test('Postgres intake replays reordered JSONB and locks before matching submissions', async (testContext) => {
  const store = new PostgresStore('postgres://unused:unused@127.0.0.1:1/unused');
  testContext.after(() => store.sql.end({ timeout: 0 }));
  const input = parseWebsiteLead({ fullName: 'Jordan Lee', email: 'jordan@example.test', products: 'Goods' });
  const payload = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(input))).reverse());
  const queries: string[] = [];
  const transaction = (async (strings: TemplateStringsArray) => {
    const query = strings.join('?');
    if (query.includes('pg_advisory_xact_lock')) {
      queries.push('lock');
      return [];
    }
    if (query.includes('from public.submissions')) {
      queries.push('submissions');
      return [{ company_id: prospect.id, payload }];
    }
    if (query.includes('from public.companies')) return [{ id: prospect.id, tags: [] }];
    assert.fail(`Unexpected intake query: ${query}`);
  }) as unknown as TransactionSql;
  testContext.mock.method(
    store.sql,
    'begin',
    async (callback: (transaction: TransactionSql) => Promise<unknown>) => callback(transaction),
  );
  const result = await store.ingestLead(input, 'postgres-replay');
  assert.equal(result.company.id, prospect.id);
  assert.equal(result.replayed, true);
  assert.equal(result.created, false);
  assert.deepEqual(queries, ['lock', 'submissions']);
  await assert.rejects(
    () => store.ingestLead({ ...input, products: 'Changed' }, 'postgres-replay'),
    /different submission/,
  );
});

test(
  'Postgres database intake stores JSONB and serializes concurrent submissions',
  {
    skip: !process.env.CRM_TEST_DATABASE_URL,
  },
  async (testContext) => {
    const connectionString = process.env.CRM_TEST_DATABASE_URL!;
    const databaseUrl = new URL(connectionString);
    assert.ok(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname));
    assert.equal(databaseUrl.pathname, '/goatara_intake_test');
    const store = Object.create(PostgresStore.prototype) as PostgresStore;
    Object.defineProperty(store, 'sql', {
      value: postgres(connectionString, { ssl: false, prepare: false, max: 5, onnotice: () => {} }),
    });
    const companyIds = new Set<string>();
    testContext.after(async () => {
      try {
        for (const companyId of companyIds)
          await store.sql`delete from public.companies where id=${companyId}`;
      } finally {
        await store.sql.end({ timeout: 5 });
      }
    });
    await store.sql.unsafe(
      readFileSync(new URL('../supabase/migrations/20260916000100_crm.sql', import.meta.url), 'utf8'),
    );
    const identifier = randomUUID();
    const input = parseWebsiteLead({
      businessName: null,
      fullName: 'Jordan Lee',
      email: `${identifier}@example.test`,
      phone: '+1 555 123 4567',
      currentSituation: 'Selling online',
      storeUrl: `https://${identifier}.example.test`,
      products: 'Home goods',
      productCount: '12',
      monthlyRevenue: 'Under $5,000',
      shippingMethod: '3PL / warehouse',
      desiredStart: 'Within 1 month',
    });
    const first = await store.ingestLead(input, identifier);
    companyIds.add(first.company.id);
    assert.equal(first.company.name, 'Unconfirmed - Jordan Lee');
    const [stored] = await store.sql`
    select payload, jsonb_typeof(payload) as kind from public.submissions where idempotency_key=${identifier}
  `;
    assert.equal(stored.kind, 'object');
    assert.deepEqual(stored.payload, input);
    const replays = await Promise.all(Array.from({ length: 6 }, () => store.ingestLead(input, identifier)));
    assert.ok(replays.every((result) => result.replayed && result.company.id === first.company.id));
    await store.sql`update public.submissions set payload=${store.sql.json(JSON.stringify(input))} where idempotency_key=${identifier}`;
    assert.equal((await store.ingestLead(input, identifier)).replayed, true);
    const legacyHistory = (await store.snapshot()).submissions.find(
      (submission) => submission.companyId === first.company.id,
    );
    assert.deepEqual(legacyHistory?.payload, input);
    await assert.rejects(
      () => store.ingestLead({ ...input, products: 'Changed' }, identifier),
      /different submission/,
    );
    const returning = await store.ingestLead({ ...input, products: 'Changed' }, `${identifier}-return`);
    assert.equal(returning.company.products, input.products);
    const [history] =
      await store.sql`select count(*)::int as count from public.submissions where company_id=${first.company.id}`;
    assert.equal(history.count, 2);
    const concurrentInput = { ...input, email: `new-${identifier}@example.test`, storeUrl: null };
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const result = await store.ingestLead(concurrentInput, randomUUID());
        companyIds.add(result.company.id);
        return result;
      }),
    );
    assert.equal(new Set(concurrent.map((result) => result.company.id)).size, 1);
    assert.equal(concurrent.filter((result) => result.created).length, 1);
    const [concurrentHistory] = await store.sql`
    select count(*)::int as count from public.submissions where company_id=${concurrent[0].company.id}
  `;
    assert.equal(concurrentHistory.count, 6);
  },
);

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

test('serverless configuration ignores PORT while standalone servers validate it', () => {
  const previous = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'false';
    process.env.APP_ORIGIN = 'https://crm.example.test';
    process.env.COOKIE_SECURE = 'true';
    process.env.SUPABASE_DB_URL = 'postgres://user:password@example.test:6543/postgres';
    for (const port of ['', '0', '65536', 'not-a-port']) {
      process.env.PORT = port;
      assert.equal(runtimeConfig({ serverless: true }).config.production, true);
      assert.throws(() => runtimeConfig(), /PORT must be between/);
    }
    process.env.PORT = '3002';
    assert.equal(runtimeConfig().port, 3002);
    delete process.env.SUPABASE_DB_URL;
    assert.throws(() => runtimeConfig({ serverless: true }), /SUPABASE_DB_URL/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
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
