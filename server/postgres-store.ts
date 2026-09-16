import postgres, { type Sql, type TransactionSql } from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  onboardingTemplate,
  stageLabels,
  transitionCompany,
  type Activity,
  type Company,
  type Contact,
  type CRMData,
  type Note,
  type OnboardingItem,
  type Task,
  type TeamMember,
} from '../shared/crm.ts';
import type { CompanyInput, CompanyPatch, LeadInput } from '../shared/validation.ts';
import { AppError, type UserRecord, websiteKey } from './store.ts';

const colors = ['green', 'blue', 'purple', 'orange', 'pink', 'cyan'];
const clean = (value: string | null | undefined) => value?.trim() || null;
const emailKey = (value: string | null | undefined) => clean(value)?.toLowerCase() ?? null;
const timestamp = (value: string | Date | null) => (value instanceof Date ? value.toISOString() : value);
const dateValue = (value: string | Date | null) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;
type QueryClient = Sql | TransactionSql;

interface CompanyRow {
  id: string;
  name: string;
  stage: Company['stage'];
  client_status: Company['clientStatus'];
  owner_id: string | null;
  deal_value: number | string;
  currency: 'USD';
  created_at: string | Date;
  updated_at: string | Date;
  client_since: string | Date | null;
  follow_up_at: string | Date | null;
  expected_close_at: string | Date | null;
  lost_reason: string | null;
  tags: string[];
  color: string;
  current_situation: string | null;
  store_url: string | null;
  store_key: string | null;
  products: string | null;
  product_count: string | null;
  monthly_revenue: string | null;
  shipping_method: string | null;
  desired_start: string | null;
}
interface ContactRow {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
}
interface NoteRow {
  id: string;
  company_id: string;
  author_id: string;
  content: string;
  kind: Note['kind'];
  pinned: boolean;
  created_at: string;
}
interface SubmissionRow {
  id: string;
  company_id: string;
  received_at: string;
  payload: Record<string, string | null>;
}

export class PostgresStore {
  readonly sql: Sql;
  constructor(connectionString: string) {
    if (!connectionString) throw new Error('SUPABASE_DB_URL is required for the Postgres store');
    this.sql = postgres(connectionString, {
      max: Number(process.env.SUPABASE_DB_POOL_SIZE ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: 'require',
    });
  }

  private companyFromRow(row: CompanyRow): Company {
    return {
      id: row.id,
      name: row.name,
      stage: row.stage,
      clientStatus: row.client_status,
      ownerId: row.owner_id,
      dealValue: Number(row.deal_value),
      currency: row.currency,
      createdAt: timestamp(row.created_at)!,
      updatedAt: timestamp(row.updated_at)!,
      clientSince: dateValue(row.client_since),
      followUpAt: dateValue(row.follow_up_at),
      expectedCloseAt: dateValue(row.expected_close_at),
      lostReason: row.lost_reason,
      tags: Array.isArray(row.tags) ? row.tags : [],
      color: row.color,
      currentSituation: row.current_situation,
      storeUrl: row.store_url,
      products: row.products,
      productCount: row.product_count,
      monthlyRevenue: row.monthly_revenue,
      shippingMethod: row.shipping_method,
      desiredStart: row.desired_start,
    };
  }

  private contactFromRow(row: ContactRow): Contact {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      title: row.title,
      isPrimary: row.is_primary,
    };
  }

  private noteFromRow(row: NoteRow): Note {
    return {
      id: row.id,
      companyId: row.company_id,
      authorId: row.author_id,
      content: row.content,
      kind: row.kind,
      pinned: row.pinned,
      createdAt: row.created_at,
    };
  }

  private async company(id: string, client: QueryClient = this.sql): Promise<Company> {
    const rows = await client<CompanyRow[]>`select * from public.companies where id = ${id}`;
    if (!rows[0]) throw new AppError('Company not found', 404);
    return this.companyFromRow(rows[0]);
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    const rows = await this.sql<
      UserRecord[]
    >`select id, name, email, role, color, password_hash as "passwordHash" from public.users where id = ${id}`;
    return rows[0];
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const rows = await this.sql<
      UserRecord[]
    >`select id, name, email, role, color, password_hash as "passwordHash" from public.users where lower(email) = lower(${email})`;
    return rows[0];
  }

  async getWorkspaceUser(): Promise<UserRecord | undefined> {
    await this.sql`insert into public.users (id, name, email, role, color, password_hash)
      values ('user-workspace', 'Shared workspace', 'workspace@goatara.invalid', 'admin', 'green', null)
      on conflict (id) do nothing`;
    return this.getUser('user-workspace');
  }

  async hasUsers(): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`select id from public.users limit 1`;
    return Boolean(rows[0]);
  }

  async insertUser(user: UserRecord) {
    await this
      .sql`insert into public.users (id, name, email, role, color, password_hash) values (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.color}, ${user.passwordHash})`;
  }

  async updatePassword(userId: string, passwordHash: string, currentTokenHash: string | null) {
    await this.sql.begin(async (tx) => {
      await tx`update public.users set password_hash = ${passwordHash} where id = ${userId}`;
      if (currentTokenHash)
        await tx`delete from public.sessions where user_id = ${userId} and token_hash <> ${currentTokenHash}`;
      else await tx`delete from public.sessions where user_id = ${userId}`;
    });
  }

  async createSession(session: { tokenHash: string; userId: string; csrfToken: string; expiresAt: string }) {
    await this.sql.begin(async (tx) => {
      await tx`delete from public.sessions where expires_at <= now()`;
      await tx`insert into public.sessions (token_hash, user_id, csrf_token, expires_at) values (${session.tokenHash}, ${session.userId}, ${session.csrfToken}, ${session.expiresAt})`;
    });
  }

  async getSession(tokenHash: string): Promise<{ userId: string; csrfToken: string } | undefined> {
    const rows = await this.sql<
      { userId: string; csrfToken: string }[]
    >`select user_id as "userId", csrf_token as "csrfToken" from public.sessions where token_hash = ${tokenHash} and expires_at > now()`;
    return rows[0];
  }

  async deleteSession(tokenHash: string) {
    await this.sql`delete from public.sessions where token_hash = ${tokenHash}`;
  }

  async createUser(input: { name: string; email: string; passwordHash: string; role: TeamMember['role'] }) {
    if (await this.getUserByEmail(input.email))
      throw new AppError('A team member with this email already exists', 409);
    const user: UserRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      color: input.role === 'admin' ? 'green' : 'blue',
      passwordHash: input.passwordHash,
    };
    await this.insertUser(user);
    return user;
  }

  async snapshot(): Promise<CRMData> {
    return this.sql.begin('isolation level repeatable read read only', async (tx) => {
      const [companies, contacts, notes, tasks, onboarding, activities, team, submissions] =
        await Promise.all([
          tx<CompanyRow[]>`select * from public.companies order by updated_at desc`,
          tx<
            ContactRow[]
          >`select id, company_id, name, email, phone, title, is_primary from public.contacts order by is_primary desc, name`,
          tx<
            NoteRow[]
          >`select id, company_id, author_id, content, kind, pinned, created_at::text as created_at from public.notes order by pinned desc, created_at desc`,
          tx<
            Task[]
          >`select id, company_id as "companyId", contact_id as "contactId", assignee_id as "assigneeId", title, due_at::text as "dueAt", priority, completed_at::text as "completedAt", created_at::text as "createdAt" from public.tasks order by due_at is null, due_at, created_at desc`,
          tx<
            OnboardingItem[]
          >`select id, company_id as "companyId", title, category, status, updated_at::text as "updatedAt", position from public.onboarding order by position`,
          tx<
            Activity[]
          >`select id, company_id as "companyId", actor_id as "actorId", type, description, created_at as "createdAt" from public.activities order by created_at desc`,
          tx<TeamMember[]>`select id, name, email, role, color from public.users order by name`,
          tx<
            SubmissionRow[]
          >`select id, company_id, received_at::text as received_at, payload from public.submissions order by received_at desc`,
        ]);
      return {
        companies: companies.map((row) => this.companyFromRow(row)),
        contacts: contacts.map((row) => this.contactFromRow(row)),
        notes: notes.map((row) => this.noteFromRow(row)),
        tasks,
        onboarding,
        activities,
        team,
        submissions: submissions.map((row) => ({
          id: row.id,
          companyId: row.company_id,
          receivedAt: row.received_at,
          payload: row.payload,
        })),
      };
    });
  }

  async createCompany(input: CompanyInput, actorId: string | null): Promise<Company> {
    return this.sql.begin(async (tx) => this.insertCompany(input, actorId, tx));
  }

  private async insertCompany(
    input: CompanyInput,
    actorId: string | null,
    client: QueryClient,
  ): Promise<Company> {
    if (input.ownerId && !(await this.getUser(input.ownerId))) throw new AppError('Team member not found');
    const now = new Date().toISOString();
    const countRows = await client<{ count: string }[]>`select count(*)::text as count from public.companies`;
    let company: Company = {
      id: randomUUID(),
      name: input.businessName,
      stage: 'new',
      clientStatus: null,
      ownerId: input.ownerId ?? null,
      dealValue: input.dealValue,
      currency: 'USD',
      createdAt: now,
      updatedAt: now,
      clientSince: null,
      followUpAt: input.followUpAt ?? null,
      expectedCloseAt: input.expectedCloseAt ?? null,
      lostReason: null,
      tags: input.tags,
      color: colors[Number(countRows[0]?.count ?? 0) % colors.length],
      currentSituation: clean(input.currentSituation),
      storeUrl: clean(input.storeUrl),
      products: clean(input.products),
      productCount: clean(input.productCount),
      monthlyRevenue: clean(input.monthlyRevenue),
      shippingMethod: clean(input.shippingMethod),
      desiredStart: clean(input.desiredStart),
    };
    company = transitionCompany(company, input.stage, now);
    await client`insert into public.companies (id,name,stage,client_status,owner_id,deal_value,currency,created_at,updated_at,client_since,follow_up_at,expected_close_at,lost_reason,tags,color,current_situation,store_url,store_key,products,product_count,monthly_revenue,shipping_method,desired_start) values (${company.id},${company.name},${company.stage},${company.clientStatus},${company.ownerId},${company.dealValue},${company.currency},${company.createdAt},${company.updatedAt},${company.clientSince},${company.followUpAt},${company.expectedCloseAt},${company.lostReason},${JSON.stringify(company.tags)},${company.color},${company.currentSituation},${company.storeUrl},${websiteKey(company.storeUrl)},${company.products},${company.productCount},${company.monthlyRevenue},${company.shippingMethod},${company.desiredStart})`;
    if (input.fullName || input.email || input.phone)
      await client`insert into public.contacts (id,company_id,name,email,phone,title,is_primary) values (${randomUUID()},${company.id},${clean(input.fullName) ?? input.businessName},${emailKey(input.email)},${clean(input.phone)},null,true)`;
    await this.activity(company.id, actorId, 'lead', 'Company added to the workspace', now, client);
    if (input.stage === 'won') await this.startOnboarding(company.id, client);
    return company;
  }

  private async saveCompany(company: Company, client: QueryClient) {
    await client`update public.companies set name=${company.name},stage=${company.stage},client_status=${company.clientStatus},owner_id=${company.ownerId},deal_value=${company.dealValue},updated_at=${company.updatedAt},client_since=${company.clientSince},follow_up_at=${company.followUpAt},expected_close_at=${company.expectedCloseAt},lost_reason=${company.lostReason},tags=${JSON.stringify(company.tags)},current_situation=${company.currentSituation},store_url=${company.storeUrl},store_key=${websiteKey(company.storeUrl)},products=${company.products},product_count=${company.productCount},monthly_revenue=${company.monthlyRevenue},shipping_method=${company.shippingMethod},desired_start=${company.desiredStart} where id=${company.id}`;
  }

  async updateCompany(id: string, patch: CompanyPatch, actorId: string): Promise<Company> {
    return this.sql.begin(async (tx) => {
      const original = await this.company(id, tx);
      if (patch.ownerId && !(await this.getUser(patch.ownerId))) throw new AppError('Team member not found');
      const now = new Date().toISOString();
      let company = { ...original, ...patch, updatedAt: now } as Company;
      if (original.clientStatus && patch.clientStatus === null)
        throw new AppError('A signed company must retain a client status');
      if (patch.stage) {
        try {
          company = { ...transitionCompany(original, patch.stage, now), ...patch, updatedAt: now } as Company;
        } catch (error) {
          throw new AppError((error as Error).message);
        }
        if (patch.stage === 'won' && !company.clientStatus) company.clientStatus = 'onboarding';
      }
      if (company.clientStatus && company.stage !== 'won')
        throw new AppError('Mark the deal as won before setting a client status');
      if (company.stage === 'won' && !company.clientStatus)
        throw new AppError('A won company needs a client status');
      if (original.stage !== 'won' && company.stage === 'won') await this.startOnboarding(id, tx);
      await this.saveCompany(company, tx);
      if (original.stage !== company.stage)
        await this.activity(
          id,
          actorId,
          'stage',
          `Moved from ${stageLabels[original.stage]} to ${stageLabels[company.stage]}`,
          now,
          tx,
        );
      else if (original.clientStatus !== company.clientStatus)
        await this.activity(
          id,
          actorId,
          'status',
          `Client status changed to ${company.clientStatus}`,
          now,
          tx,
        );
      else await this.activity(id, actorId, 'update', 'Company details updated', now, tx);
      return company;
    });
  }

  private async startOnboarding(companyId: string, client: QueryClient) {
    const now = new Date().toISOString();
    for (const [position, [title, category]] of onboardingTemplate.entries()) {
      await client`insert into public.onboarding (id,company_id,title,category,status,updated_at,position) values (${randomUUID()},${companyId},${title},${category},'needed',${now},${position}) on conflict (company_id,title) do nothing`;
    }
  }

  async ingestLead(
    input: LeadInput,
    idempotencyKey: string | null,
  ): Promise<{ company: Company; created: boolean; replayed: boolean }> {
    return this.sql.begin(async (tx) => {
      if (idempotencyKey) {
        const previous = await tx<
          { company_id: string; payload: Record<string, unknown> }[]
        >`select company_id, payload from public.submissions where idempotency_key=${idempotencyKey}`;
        if (previous[0]) {
          if (JSON.stringify(previous[0].payload) !== JSON.stringify(input))
            throw new AppError('This idempotency key was already used for a different submission', 409);
          return { company: await this.company(previous[0].company_id, tx), created: false, replayed: true };
        }
      }
      const email = emailKey(input.email);
      const storeKey = websiteKey(input.storeUrl);
      const emailMatches = email
        ? (
            await tx<{ company_id: string }[]>`
              select distinct company_id from public.contacts where lower(email)=${email}
            `
          ).map((row) => row.company_id)
        : [];
      const websiteMatches = storeKey
        ? (await tx<{ id: string }[]>`select id from public.companies where store_key=${storeKey}`).map(
            (row) => row.id,
          )
        : [];
      const matches = [...new Set([...emailMatches, ...websiteMatches])];
      if (matches.length > 1)
        throw new AppError(
          'Submission matches multiple companies. Review the contact and website before retrying.',
          409,
        );
      const created = matches.length === 0;
      let company: Company;
      if (created)
        company = await this.insertCompany({ ...input, stage: 'new', tags: [], dealValue: 0 }, null, tx);
      else {
        company = await this.company(matches[0], tx);
        if (
          emailMatches.length &&
          storeKey &&
          websiteKey(company.storeUrl) &&
          storeKey !== websiteKey(company.storeUrl)
        )
          throw new AppError(
            'The contact matches an existing company with a different website. Review before retrying.',
            409,
          );
        for (const field of [
          'currentSituation',
          'storeUrl',
          'products',
          'productCount',
          'monthlyRevenue',
          'shippingMethod',
          'desiredStart',
        ] as const)
          if (!company[field] && input[field]) company[field] = clean(input[field]);
        company.updatedAt = new Date().toISOString();
        await this.saveCompany(company, tx);
        const existingContact = email
          ? (
              await tx<ContactRow[]>`
                select id, company_id, name, email, phone, title, is_primary
                from public.contacts where company_id=${company.id} and lower(email)=${email}
              `
            )[0]
          : undefined;
        if (existingContact)
          await tx`update public.contacts set phone=coalesce(phone,${clean(input.phone)}) where id=${existingContact.id}`;
        else if (input.fullName || email || input.phone) {
          const hasPrimary = Boolean(
            (
              await tx`
              select id from public.contacts where company_id=${company.id} and is_primary=true limit 1
            `
            )[0],
          );
          await tx`insert into public.contacts (id,company_id,name,email,phone,title,is_primary) values (${randomUUID()},${company.id},${clean(input.fullName) ?? input.businessName},${email},${clean(input.phone)},null,${!hasPrimary})`;
        }
      }
      await tx`insert into public.submissions (id,company_id,received_at,payload,idempotency_key) values (${randomUUID()},${company.id},${new Date().toISOString()},${JSON.stringify(input)},${idempotencyKey})`;
      await this.activity(
        company.id,
        null,
        'lead',
        created ? 'Website enquiry received' : 'New website enquiry linked to this company',
        new Date().toISOString(),
        tx,
      );
      return { company, created, replayed: false };
    });
  }

  private async activity(
    companyId: string,
    actorId: string | null,
    type: Activity['type'],
    description: string,
    createdAt: string,
    client: QueryClient = this.sql,
  ) {
    await client`insert into public.activities (id,company_id,actor_id,type,description,created_at) values (${randomUUID()},${companyId},${actorId},${type},${description},${createdAt})`;
  }

  async addNote(
    companyId: string,
    input: { content: string; kind: Note['kind'] },
    authorId: string,
  ): Promise<Note> {
    return this.sql.begin(async (tx) => {
      await this.company(companyId, tx);
      const note = {
        id: randomUUID(),
        companyId,
        authorId,
        ...input,
        pinned: false,
        createdAt: new Date().toISOString(),
      };
      await tx`insert into public.notes (id,company_id,author_id,content,kind,pinned,created_at) values (${note.id},${note.companyId},${note.authorId},${note.content},${note.kind},false,${note.createdAt})`;
      await this.activity(
        companyId,
        authorId,
        'note',
        input.kind === 'call'
          ? 'Added a call note'
          : input.kind === 'meeting'
            ? 'Added a meeting note'
            : 'Added a note',
        note.createdAt,
        tx,
      );
      return note;
    });
  }

  async pinNote(id: string, pinned: boolean) {
    const result = await this.sql`update public.notes set pinned=${pinned} where id=${id} returning id`;
    if (!result[0]) throw new AppError('Note not found', 404);
  }

  async addContact(
    companyId: string,
    input: Omit<Contact, 'id' | 'companyId'>,
    actorId: string,
  ): Promise<Contact> {
    return this.sql.begin(async (tx) => {
      await this.company(companyId, tx);
      const email = emailKey(input.email);
      if (
        email &&
        (await tx`select id from public.contacts where company_id=${companyId} and lower(email)=${email}`)[0]
      )
        throw new AppError('This email is already a contact for this company', 409);
      const existing = await tx`select id from public.contacts where company_id=${companyId}`;
      const isPrimary = input.isPrimary || !existing[0];
      if (isPrimary) await tx`update public.contacts set is_primary=false where company_id=${companyId}`;
      const contact = { ...input, email, id: randomUUID(), companyId, isPrimary };
      await tx`insert into public.contacts (id,company_id,name,email,phone,title,is_primary) values (${contact.id},${companyId},${contact.name},${email},${clean(contact.phone)},${clean(contact.title)},${isPrimary})`;
      await this.activity(
        companyId,
        actorId,
        'contact',
        `Added contact ${input.name}`,
        new Date().toISOString(),
        tx,
      );
      return contact;
    });
  }

  async updateContact(
    id: string,
    input: Omit<Contact, 'id' | 'companyId'>,
    actorId: string,
  ): Promise<Contact> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<ContactRow[]>`select * from public.contacts where id=${id}`;
      const existing = rows[0];
      if (!existing) throw new AppError('Contact not found', 404);
      const email = emailKey(input.email);
      if (
        email &&
        (
          await tx`select id from public.contacts where company_id=${existing.company_id} and lower(email)=${email} and id<>${id}`
        )[0]
      )
        throw new AppError('This email is already a contact for this company', 409);
      if (input.isPrimary)
        await tx`update public.contacts set is_primary=false where company_id=${existing.company_id}`;
      const isPrimary = input.isPrimary || existing.is_primary;
      await tx`update public.contacts set name=${input.name},email=${email},phone=${clean(input.phone)},title=${clean(input.title)},is_primary=${isPrimary} where id=${id}`;
      await this.activity(
        existing.company_id,
        actorId,
        'contact',
        `Updated contact ${input.name}`,
        new Date().toISOString(),
        tx,
      );
      return { id, companyId: existing.company_id, ...input, email, isPrimary };
    });
  }

  private async validateTaskLinks(
    companyId: string,
    contactId?: string | null,
    assigneeId?: string | null,
    client: QueryClient = this.sql,
  ) {
    await this.company(companyId, client);
    if (assigneeId && !(await this.getUser(assigneeId))) throw new AppError('Team member not found');
    if (
      contactId &&
      !(await client`select id from public.contacts where id=${contactId} and company_id=${companyId}`)[0]
    )
      throw new AppError('The contact must belong to this company');
  }

  async addTask(input: Omit<Task, 'id' | 'createdAt' | 'completedAt'>, actorId: string): Promise<Task> {
    return this.sql.begin(async (tx) => {
      await this.validateTaskLinks(input.companyId, input.contactId, input.assigneeId, tx);
      const task = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), completedAt: null };
      await tx`insert into public.tasks (id,company_id,contact_id,assignee_id,title,due_at,priority,completed_at,created_at) values (${task.id},${task.companyId},${task.contactId},${task.assigneeId},${task.title},${task.dueAt},${task.priority},null,${task.createdAt})`;
      await this.activity(
        input.companyId,
        actorId,
        'task',
        `Created task: ${input.title}`,
        task.createdAt,
        tx,
      );
      return task;
    });
  }

  async updateTask(
    id: string,
    patch: Partial<Omit<Task, 'id' | 'companyId' | 'createdAt' | 'completedAt'>> & { completed?: boolean },
    actorId: string,
  ): Promise<Task> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<
        Task[]
      >`select id,company_id as "companyId",contact_id as "contactId",assignee_id as "assigneeId",title,due_at as "dueAt",priority,completed_at as "completedAt",created_at as "createdAt" from public.tasks where id=${id}`;
      const original = rows[0];
      if (!original) throw new AppError('Task not found', 404);
      const { completed, ...fields } = patch;
      const task = { ...original, ...fields };
      if (completed !== undefined)
        task.completedAt = completed ? (original.completedAt ?? new Date().toISOString()) : null;
      await this.validateTaskLinks(task.companyId, task.contactId, task.assigneeId, tx);
      await tx`update public.tasks set contact_id=${task.contactId},assignee_id=${task.assigneeId},title=${task.title},due_at=${task.dueAt},priority=${task.priority},completed_at=${task.completedAt} where id=${id}`;
      await this.activity(
        task.companyId,
        actorId,
        'task',
        `${completed === true ? 'Completed' : completed === false ? 'Reopened' : 'Updated'} task: ${task.title}`,
        new Date().toISOString(),
        tx,
      );
      return task;
    });
  }

  async addOnboarding(
    companyId: string,
    input: Pick<OnboardingItem, 'title' | 'category'>,
    actorId: string,
  ): Promise<OnboardingItem> {
    return this.sql.begin(async (tx) => {
      if (!(await this.company(companyId, tx)).clientStatus)
        throw new AppError('Onboarding is available after a deal is won');
      if (
        (await tx`select id from public.onboarding where company_id=${companyId} and title=${input.title}`)[0]
      )
        throw new AppError('An onboarding item with this name already exists', 409);
      const positionRows = await tx<
        { position: number }[]
      >`select coalesce(max(position),-1)+1 as position from public.onboarding where company_id=${companyId}`;
      const item: OnboardingItem = {
        ...input,
        id: randomUUID(),
        companyId,
        status: 'needed',
        updatedAt: new Date().toISOString(),
        position: Number(positionRows[0].position),
      };
      await tx`insert into public.onboarding (id,company_id,title,category,status,updated_at,position) values (${item.id},${companyId},${item.title},${item.category},${item.status},${item.updatedAt},${item.position})`;
      await this.activity(
        companyId,
        actorId,
        'onboarding',
        `Added onboarding item: ${input.title}`,
        item.updatedAt,
        tx,
      );
      return item;
    });
  }

  async updateOnboarding(id: string, status: OnboardingItem['status'], actorId: string) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<
        OnboardingItem[]
      >`select id,company_id as "companyId",title,category,status,updated_at as "updatedAt",position from public.onboarding where id=${id}`;
      const item = rows[0];
      if (!item) throw new AppError('Onboarding item not found', 404);
      const updatedAt = new Date().toISOString();
      await tx`update public.onboarding set status=${status},updated_at=${updatedAt} where id=${id}`;
      await this.activity(
        item.companyId,
        actorId,
        'onboarding',
        `${item.title}: ${status.replace('_', ' ')}`,
        updatedAt,
        tx,
      );
    });
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
