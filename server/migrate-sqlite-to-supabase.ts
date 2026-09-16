import postgres, { type Sql, type TransactionSql } from 'postgres';
import { Store } from './store.ts';
import { runtimeConfig } from './config.ts';

type QueryClient = Sql | TransactionSql;
type Row = Record<string, string | number | boolean | null>;

async function insertRows(
  client: QueryClient,
  table: string,
  columns: string[],
  rows: Row[],
  conflict = 'do nothing',
) {
  for (const row of rows) {
    const values = columns.map((column) => row[column] ?? null);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    await client.unsafe(
      `insert into public.${table} (${columns.join(',')}) values (${placeholders}) on conflict ${conflict}`,
      values,
    );
  }
}

async function migrate() {
  const { databasePath, supabaseDbUrl } = runtimeConfig();
  if (!supabaseDbUrl) throw new Error('Set SUPABASE_DB_URL before running the migration');
  if (process.env.DEMO_MODE === 'true')
    throw new Error('Refusing to migrate the demo database. Set DEMO_MODE=false.');
  const source = new Store(databasePath);
  const sql = postgres(supabaseDbUrl, { prepare: false, ssl: 'require', max: 3 });
  try {
    const users = source.all<Row>('select id,name,email,role,color,passwordHash from users');
    const companies = source.all<Row>('select * from companies');
    const contacts = source.all<Row>('select * from contacts');
    const notes = source.all<Row>('select * from notes');
    const tasks = source.all<Row>('select * from tasks');
    const onboarding = source.all<Row>('select * from onboarding');
    const activities = source.all<Row>('select * from activities');
    const submissions = source.all<Row>('select * from submissions');
    await sql.begin(async (tx) => {
      await insertRows(
        tx,
        'users',
        ['id', 'name', 'email', 'role', 'color', 'password_hash'],
        users.map((row) => ({ ...row, password_hash: row.passwordHash })),
      );
      await insertRows(
        tx,
        'companies',
        [
          'id',
          'name',
          'stage',
          'client_status',
          'owner_id',
          'deal_value',
          'currency',
          'created_at',
          'updated_at',
          'client_since',
          'follow_up_at',
          'expected_close_at',
          'lost_reason',
          'tags',
          'color',
          'current_situation',
          'store_url',
          'store_key',
          'products',
          'product_count',
          'monthly_revenue',
          'shipping_method',
          'desired_start',
        ],
        companies.map((row) => ({
          ...row,
          client_status: row.clientStatus,
          owner_id: row.ownerId,
          deal_value: row.dealValue,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          client_since: row.clientSince,
          follow_up_at: row.followUpAt,
          expected_close_at: row.expectedCloseAt,
          lost_reason: row.lostReason,
          tags: row.tags,
          current_situation: row.currentSituation,
          store_url: row.storeUrl,
          store_key: row.storeKey,
          product_count: row.productCount,
          monthly_revenue: row.monthlyRevenue,
          shipping_method: row.shippingMethod,
          desired_start: row.desiredStart,
        })),
      );
      await insertRows(
        tx,
        'contacts',
        ['id', 'company_id', 'name', 'email', 'phone', 'title', 'is_primary'],
        contacts.map((row) => ({ ...row, company_id: row.companyId, is_primary: Boolean(row.isPrimary) })),
      );
      await insertRows(
        tx,
        'notes',
        ['id', 'company_id', 'author_id', 'content', 'kind', 'pinned', 'created_at'],
        notes.map((row) => ({
          ...row,
          company_id: row.companyId,
          author_id: row.authorId,
          pinned: Boolean(row.pinned),
          created_at: row.createdAt,
        })),
      );
      await insertRows(
        tx,
        'tasks',
        [
          'id',
          'company_id',
          'contact_id',
          'assignee_id',
          'title',
          'due_at',
          'priority',
          'completed_at',
          'created_at',
        ],
        tasks.map((row) => ({
          ...row,
          company_id: row.companyId,
          contact_id: row.contactId,
          assignee_id: row.assigneeId,
          due_at: row.dueAt,
          completed_at: row.completedAt,
          created_at: row.createdAt,
        })),
      );
      await insertRows(
        tx,
        'onboarding',
        ['id', 'company_id', 'title', 'category', 'status', 'updated_at', 'position'],
        onboarding.map((row) => ({ ...row, company_id: row.companyId, updated_at: row.updatedAt })),
      );
      await insertRows(
        tx,
        'activities',
        ['id', 'company_id', 'actor_id', 'type', 'description', 'created_at'],
        activities.map((row) => ({
          ...row,
          company_id: row.companyId,
          actor_id: row.actorId,
          created_at: row.createdAt,
        })),
      );
      await insertRows(
        tx,
        'submissions',
        ['id', 'company_id', 'received_at', 'payload', 'idempotency_key'],
        submissions.map((row) => ({
          ...row,
          company_id: row.companyId,
          received_at: row.receivedAt,
          payload: row.payload,
          idempotency_key: row.idempotencyKey,
        })),
      );
    });
    console.log(
      JSON.stringify(
        {
          migrated: {
            users: users.length,
            companies: companies.length,
            contacts: contacts.length,
            notes: notes.length,
            tasks: tasks.length,
            onboarding: onboarding.length,
            activities: activities.length,
            submissions: submissions.length,
          },
          sessions: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    source.close();
    await sql.end({ timeout: 5 });
  }
}

try {
  await migrate();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
}
