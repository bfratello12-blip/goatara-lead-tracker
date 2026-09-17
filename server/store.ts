import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  onboardingTemplate,
  stageLabels,
  transitionCompany,
  type Company,
  type Contact,
  type CRMData,
  type Note,
  type Task,
  type OnboardingItem,
  type Activity,
  type TeamMember,
  type LeadSubmission,
} from '../shared/crm.ts';
import type { LeadInput, CompanyInput, CompanyPatch } from '../shared/validation.ts';

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type StoredCompany = Omit<Company, 'tags'> & { tags: string; storeKey: string | null };
type StoredContact = Omit<Contact, 'isPrimary'> & { isPrimary: number };
type StoredNote = Omit<Note, 'pinned'> & { pinned: number };
type Table =
  | 'companies'
  | 'contacts'
  | 'notes'
  | 'tasks'
  | 'onboarding'
  | 'activities'
  | 'submissions'
  | 'users'
  | 'sessions';
export type UserRecord = TeamMember & { passwordHash: string | null };

const colors = ['green', 'blue', 'purple', 'orange', 'pink', 'cyan'];
const clean = (value: string | null | undefined) => value?.trim() || null;
const emailKey = (value: string | null | undefined) => clean(value)?.toLowerCase() ?? null;

export function websiteKey(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const sharedHost =
      /(^|\.)(amazon\.[a-z.]+|etsy\.com|ebay\.[a-z.]+|walmart\.com|instagram\.com|facebook\.com|linktr\.ee)$/.test(
        host,
      );
    if (sharedHost) {
      const path = parsed.pathname.replace(/\/+$/, '');
      return path ? `${host}${path}` : null;
    }
    return host;
  } catch {
    return null;
  }
}

export class Store {
  db: DatabaseSync;

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  migrate() {
    const version = this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
    if (version > 1)
      throw new Error('Database is newer than this application. Update the application before opening it.');
    if (version === 1) return;
    this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('admin','member')), color TEXT NOT NULL,
        passwordHash TEXT, createdAt TEXT NOT NULL
      );
      CREATE TABLE companies (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        stage TEXT NOT NULL CHECK(stage IN ('new','contacted','discovery','proposal','won','lost')),
        clientStatus TEXT CHECK(clientStatus IN ('onboarding','active','paused','cancelled')),
        ownerId TEXT REFERENCES users(id), dealValue REAL NOT NULL DEFAULT 0 CHECK(dealValue >= 0),
        currency TEXT NOT NULL DEFAULT 'USD', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        clientSince TEXT, followUpAt TEXT, expectedCloseAt TEXT, lostReason TEXT,
        tags TEXT NOT NULL DEFAULT '[]', color TEXT NOT NULL,
        currentSituation TEXT, storeUrl TEXT, storeKey TEXT, products TEXT, productCount TEXT,
        monthlyRevenue TEXT, shippingMethod TEXT, desiredStart TEXT,
        CHECK(clientStatus IS NULL OR stage = 'won')
      );
      CREATE INDEX companies_stage ON companies(stage);
      CREATE INDEX companies_client ON companies(clientStatus);
      CREATE INDEX companies_store ON companies(storeKey);
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL, email TEXT COLLATE NOCASE, phone TEXT, title TEXT,
        isPrimary INTEGER NOT NULL DEFAULT 0 CHECK(isPrimary IN (0,1))
      );
      CREATE INDEX contacts_company ON contacts(companyId);
      CREATE INDEX contacts_email ON contacts(email);
      CREATE UNIQUE INDEX one_primary_contact ON contacts(companyId) WHERE isPrimary = 1;
      CREATE UNIQUE INDEX company_contact_email ON contacts(companyId, email) WHERE email IS NOT NULL;
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        authorId TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('note','call','meeting')),
        pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)), createdAt TEXT NOT NULL
      );
      CREATE INDEX notes_company_date ON notes(companyId, createdAt DESC);
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        contactId TEXT REFERENCES contacts(id), assigneeId TEXT REFERENCES users(id),
        title TEXT NOT NULL, dueAt TEXT, priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
        completedAt TEXT, createdAt TEXT NOT NULL
      );
      CREATE INDEX tasks_company ON tasks(companyId);
      CREATE INDEX tasks_due ON tasks(completedAt, dueAt);
      CREATE TABLE onboarding (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        title TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('setup','access','launch')),
        status TEXT NOT NULL CHECK(status IN ('needed','requested','received','not_required')),
        updatedAt TEXT NOT NULL, position INTEGER NOT NULL,
        UNIQUE(companyId, title)
      );
      CREATE TABLE activities (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        actorId TEXT REFERENCES users(id), type TEXT NOT NULL, description TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX activities_date ON activities(createdAt DESC);
      CREATE INDEX activities_company ON activities(companyId, createdAt DESC);
      CREATE TABLE submissions (
        id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id),
        receivedAt TEXT NOT NULL, payload TEXT NOT NULL, idempotencyKey TEXT UNIQUE
      );
      CREATE INDEX submissions_company ON submissions(companyId);
      CREATE TABLE sessions (
        tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrfToken TEXT NOT NULL, expiresAt TEXT NOT NULL
      );
      CREATE INDEX sessions_expiry ON sessions(expiresAt);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }

  all<Type>(sql: string, ...params: SQLInputValue[]): Type[] {
    return this.db.prepare(sql).all(...params) as unknown as Type[];
  }

  get<Type>(sql: string, ...params: SQLInputValue[]): Type | undefined {
    return this.db.prepare(sql).get(...params) as unknown as Type | undefined;
  }

  insert(table: Table, values: Record<string, SQLInputValue>) {
    const keys = Object.keys(values);
    this.db
      .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...Object.values(values));
  }

  transaction<Type>(operation: () => Type): Type {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  decodeCompany(row: StoredCompany): Company {
    const { storeKey: _storeKey, ...company } = row;
    return { ...company, tags: JSON.parse(row.tags) as string[] };
  }

  company(id: string): Company {
    const row = this.get<StoredCompany>('SELECT * FROM companies WHERE id = ?', id);
    if (!row) throw new AppError('Company not found', 404);
    return this.decodeCompany(row);
  }

  assertUser(id: string | null | undefined) {
    if (id && !this.get('SELECT id FROM users WHERE id = ?', id)) throw new AppError('Team member not found');
  }

  activity(
    companyId: string,
    actorId: string | null,
    type: Activity['type'],
    description: string,
    createdAt = new Date().toISOString(),
  ) {
    this.insert('activities', { id: randomUUID(), companyId, actorId, type, description, createdAt });
  }

  snapshot(): CRMData {
    return {
      companies: this.all<StoredCompany>('SELECT * FROM companies ORDER BY updatedAt DESC').map((row) =>
        this.decodeCompany(row),
      ),
      contacts: this.all<StoredContact>('SELECT * FROM contacts ORDER BY isPrimary DESC, name').map(
        (row) => ({ ...row, isPrimary: Boolean(row.isPrimary) }),
      ),
      notes: this.all<StoredNote>('SELECT * FROM notes ORDER BY pinned DESC, createdAt DESC').map((row) => ({
        ...row,
        pinned: Boolean(row.pinned),
      })),
      tasks: this.all<Task>('SELECT * FROM tasks ORDER BY dueAt IS NULL, dueAt, createdAt DESC'),
      onboarding: this.all<OnboardingItem>('SELECT * FROM onboarding ORDER BY position'),
      activities: this.all<Activity>('SELECT * FROM activities ORDER BY createdAt DESC'),
      team: this.all<TeamMember>('SELECT id, name, email, role, color FROM users ORDER BY name'),
      submissions: this.all<Omit<LeadSubmission, 'payload'> & { payload: string }>(
        'SELECT id, companyId, receivedAt, payload FROM submissions ORDER BY receivedAt DESC',
      ).map((row) => ({ ...row, payload: JSON.parse(row.payload) as LeadSubmission['payload'] })),
    };
  }

  saveCompany(company: Company) {
    const values = { ...company, tags: JSON.stringify(company.tags), storeKey: websiteKey(company.storeUrl) };
    const { id, ...fields } = values;
    this.db
      .prepare(
        `UPDATE companies SET ${Object.keys(fields)
          .map((key) => `${key} = ?`)
          .join(',')} WHERE id = ?`,
      )
      .run(...Object.values(fields), id);
  }

  createCompany(input: CompanyInput, actorId: string | null): Company {
    return this.transaction(() => this.insertCompany(input, actorId));
  }

  deleteCompany(id: string): void {
    this.transaction(() => {
      this.company(id);
      for (const table of ['submissions', 'activities', 'onboarding', 'tasks', 'notes', 'contacts'] as const)
        this.db.prepare(`DELETE FROM ${table} WHERE companyId = ?`).run(id);
      this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
    });
  }

  insertCompany(input: CompanyInput, actorId: string | null): Company {
    this.assertUser(input.ownerId);
    const now = new Date().toISOString();
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
      color:
        colors[this.get<{ count: number }>('SELECT COUNT(*) AS count FROM companies')!.count % colors.length],
      currentSituation: clean(input.currentSituation),
      storeUrl: clean(input.storeUrl),
      products: clean(input.products),
      productCount: clean(input.productCount),
      monthlyRevenue: clean(input.monthlyRevenue),
      shippingMethod: clean(input.shippingMethod),
      desiredStart: clean(input.desiredStart),
    };
    company = transitionCompany(company, input.stage, now);
    this.insert('companies', {
      ...company,
      tags: JSON.stringify(company.tags),
      storeKey: websiteKey(company.storeUrl),
    });
    if (input.fullName || input.email || input.phone) {
      this.insert('contacts', {
        id: randomUUID(),
        companyId: company.id,
        name: clean(input.fullName) ?? input.businessName,
        email: emailKey(input.email),
        phone: clean(input.phone),
        title: null,
        isPrimary: 1,
      });
    }
    this.activity(company.id, actorId, 'lead', 'Company added to the workspace');
    if (input.stage === 'won') this.startOnboarding(company.id);
    return company;
  }

  updateCompany(id: string, patch: CompanyPatch, actorId: string): Company {
    return this.transaction(() => {
      const original = this.company(id);
      this.assertUser(patch.ownerId);
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
      if (original.stage !== 'won' && company.stage === 'won') this.startOnboarding(id);
      this.saveCompany(company);
      if (original.stage !== company.stage)
        this.activity(
          id,
          actorId,
          'stage',
          `Moved from ${stageLabels[original.stage]} to ${stageLabels[company.stage]}`,
        );
      else if (original.clientStatus !== company.clientStatus)
        this.activity(id, actorId, 'status', `Client status changed to ${company.clientStatus}`);
      else this.activity(id, actorId, 'update', 'Company details updated');
      return company;
    });
  }

  startOnboarding(companyId: string) {
    onboardingTemplate.forEach(([title, category], position) => {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO onboarding (id,companyId,title,category,status,updatedAt,position) VALUES (?,?,?,?,?,?,?)',
        )
        .run(randomUUID(), companyId, title, category, 'needed', new Date().toISOString(), position);
    });
  }

  ingestLead(
    input: LeadInput,
    idempotencyKey: string | null,
  ): { company: Company; created: boolean; replayed: boolean } {
    return this.transaction(() => {
      if (idempotencyKey) {
        const previous = this.get<{ companyId: string; payload: string }>(
          'SELECT companyId, payload FROM submissions WHERE idempotencyKey = ?',
          idempotencyKey,
        );
        if (previous) {
          if (previous.payload !== JSON.stringify(input))
            throw new AppError('This idempotency key was already used for a different submission', 409);
          return { company: this.company(previous.companyId), created: false, replayed: true };
        }
      }
      const email = emailKey(input.email);
      const storeKey = websiteKey(input.storeUrl);
      const emailMatches = email
        ? this.all<{ companyId: string }>(
            'SELECT DISTINCT companyId FROM contacts WHERE email = ? COLLATE NOCASE',
            email,
          ).map((row) => row.companyId)
        : [];
      const websiteMatches = storeKey
        ? this.all<{ id: string }>('SELECT id FROM companies WHERE storeKey = ?', storeKey).map(
            (row) => row.id,
          )
        : [];
      const matches = [...new Set([...emailMatches, ...websiteMatches])];
      if (matches.length > 1)
        throw new AppError(
          'Submission matches multiple companies. Review the contact and website before retrying.',
          409,
        );
      let company: Company;
      const created = matches.length === 0;
      if (created) {
        company = this.insertCompany({ ...input, stage: 'new', tags: [], dealValue: 0 }, null);
      } else {
        company = this.company(matches[0]);
        if (
          emailMatches.length &&
          storeKey &&
          websiteKey(company.storeUrl) &&
          storeKey !== websiteKey(company.storeUrl)
        ) {
          throw new AppError(
            'The contact matches an existing company with a different website. Review before retrying.',
            409,
          );
        }
        const fields = [
          'currentSituation',
          'storeUrl',
          'products',
          'productCount',
          'monthlyRevenue',
          'shippingMethod',
          'desiredStart',
        ] as const;
        for (const field of fields) if (!company[field] && input[field]) company[field] = clean(input[field]);
        company.updatedAt = new Date().toISOString();
        this.saveCompany(company);
        const existingContact = email
          ? this.get<Contact>(
              'SELECT * FROM contacts WHERE companyId = ? AND email = ? COLLATE NOCASE',
              company.id,
              email,
            )
          : undefined;
        if (existingContact) {
          this.db
            .prepare('UPDATE contacts SET phone = COALESCE(phone, ?) WHERE id = ?')
            .run(clean(input.phone), existingContact.id);
        } else if (input.fullName || email || input.phone) {
          const hasPrimary = Boolean(
            this.get('SELECT id FROM contacts WHERE companyId = ? AND isPrimary = 1', company.id),
          );
          this.insert('contacts', {
            id: randomUUID(),
            companyId: company.id,
            name: clean(input.fullName) ?? input.businessName,
            email,
            phone: clean(input.phone),
            title: null,
            isPrimary: hasPrimary ? 0 : 1,
          });
        }
      }
      this.insert('submissions', {
        id: randomUUID(),
        companyId: company.id,
        receivedAt: new Date().toISOString(),
        payload: JSON.stringify(input),
        idempotencyKey,
      });
      this.activity(
        company.id,
        null,
        'lead',
        created ? 'Website enquiry received' : 'New website enquiry linked to this company',
      );
      return { company, created, replayed: false };
    });
  }

  addNote(companyId: string, input: { content: string; kind: Note['kind'] }, authorId: string): Note {
    return this.transaction(() => {
      this.company(companyId);
      const note = {
        id: randomUUID(),
        companyId,
        authorId,
        ...input,
        pinned: false,
        createdAt: new Date().toISOString(),
      };
      this.insert('notes', { ...note, pinned: 0 });
      this.activity(
        companyId,
        authorId,
        'note',
        input.kind === 'call'
          ? 'Added a call note'
          : input.kind === 'meeting'
            ? 'Added a meeting note'
            : 'Added a note',
      );
      return note;
    });
  }

  pinNote(id: string, pinned: boolean) {
    if (!this.get('SELECT id FROM notes WHERE id = ?', id)) throw new AppError('Note not found', 404);
    this.db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  }

  addContact(companyId: string, input: Omit<Contact, 'id' | 'companyId'>, actorId: string): Contact {
    return this.transaction(() => {
      this.company(companyId);
      const email = emailKey(input.email);
      if (email && this.get('SELECT id FROM contacts WHERE companyId = ? AND email = ?', companyId, email))
        throw new AppError('This email is already a contact for this company', 409);
      const isPrimary =
        input.isPrimary || !this.get('SELECT id FROM contacts WHERE companyId = ?', companyId);
      if (isPrimary) this.db.prepare('UPDATE contacts SET isPrimary = 0 WHERE companyId = ?').run(companyId);
      const contact = { ...input, email, id: randomUUID(), companyId, isPrimary };
      this.insert('contacts', { ...contact, isPrimary: isPrimary ? 1 : 0 });
      this.activity(companyId, actorId, 'contact', `Added contact ${input.name}`);
      return contact;
    });
  }

  updateContact(id: string, input: Omit<Contact, 'id' | 'companyId'>, actorId: string): Contact {
    return this.transaction(() => {
      const existing = this.get<StoredContact>('SELECT * FROM contacts WHERE id = ?', id);
      if (!existing) throw new AppError('Contact not found', 404);
      const email = emailKey(input.email);
      if (
        email &&
        this.get(
          'SELECT id FROM contacts WHERE companyId = ? AND email = ? AND id <> ?',
          existing.companyId,
          email,
          id,
        )
      )
        throw new AppError('This email is already a contact for this company', 409);
      if (input.isPrimary)
        this.db.prepare('UPDATE contacts SET isPrimary = 0 WHERE companyId = ?').run(existing.companyId);
      const isPrimary = input.isPrimary || Boolean(existing.isPrimary);
      this.db
        .prepare('UPDATE contacts SET name = ?, email = ?, phone = ?, title = ?, isPrimary = ? WHERE id = ?')
        .run(input.name, email, clean(input.phone), clean(input.title), isPrimary ? 1 : 0, id);
      this.activity(existing.companyId, actorId, 'contact', `Updated contact ${input.name}`);
      return { id, companyId: existing.companyId, ...input, email, isPrimary };
    });
  }

  validateTaskLinks(companyId: string, contactId?: string | null, assigneeId?: string | null) {
    this.company(companyId);
    this.assertUser(assigneeId);
    if (
      contactId &&
      !this.get('SELECT id FROM contacts WHERE id = ? AND companyId = ?', contactId, companyId)
    )
      throw new AppError('The contact must belong to this company');
  }

  addTask(input: Omit<Task, 'id' | 'createdAt' | 'completedAt'>, actorId: string): Task {
    return this.transaction(() => {
      this.validateTaskLinks(input.companyId, input.contactId, input.assigneeId);
      const task = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), completedAt: null };
      this.insert('tasks', { ...task });
      this.activity(input.companyId, actorId, 'task', `Created task: ${input.title}`);
      return task;
    });
  }

  updateTask(
    id: string,
    patch: Partial<Omit<Task, 'id' | 'companyId' | 'createdAt' | 'completedAt'>> & { completed?: boolean },
    actorId: string,
  ): Task {
    return this.transaction(() => {
      const original = this.get<Task>('SELECT * FROM tasks WHERE id = ?', id);
      if (!original) throw new AppError('Task not found', 404);
      const { completed, ...fields } = patch;
      const task = { ...original, ...fields };
      if (completed !== undefined)
        task.completedAt = completed ? (original.completedAt ?? new Date().toISOString()) : null;
      this.validateTaskLinks(task.companyId, task.contactId, task.assigneeId);
      this.db
        .prepare(
          'UPDATE tasks SET contactId = ?, assigneeId = ?, title = ?, dueAt = ?, priority = ?, completedAt = ? WHERE id = ?',
        )
        .run(task.contactId, task.assigneeId, task.title, task.dueAt, task.priority, task.completedAt, id);
      this.activity(
        task.companyId,
        actorId,
        'task',
        `${completed === true ? 'Completed' : completed === false ? 'Reopened' : 'Updated'} task: ${task.title}`,
      );
      return task;
    });
  }

  addOnboarding(
    companyId: string,
    input: Pick<OnboardingItem, 'title' | 'category'>,
    actorId: string,
  ): OnboardingItem {
    return this.transaction(() => {
      if (!this.company(companyId).clientStatus)
        throw new AppError('Onboarding is available after a deal is won');
      if (this.get('SELECT id FROM onboarding WHERE companyId = ? AND title = ?', companyId, input.title))
        throw new AppError('An onboarding item with this name already exists', 409);
      const position = this.get<{ position: number }>(
        'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM onboarding WHERE companyId = ?',
        companyId,
      )!.position;
      const item: OnboardingItem = {
        ...input,
        id: randomUUID(),
        companyId,
        status: 'needed',
        updatedAt: new Date().toISOString(),
        position,
      };
      this.insert('onboarding', { ...item });
      this.activity(companyId, actorId, 'onboarding', `Added onboarding item: ${input.title}`);
      return item;
    });
  }

  updateOnboarding(id: string, status: OnboardingItem['status'], actorId: string) {
    return this.transaction(() => {
      const item = this.get<OnboardingItem>('SELECT * FROM onboarding WHERE id = ?', id);
      if (!item) throw new AppError('Onboarding item not found', 404);
      this.db
        .prepare('UPDATE onboarding SET status = ?, updatedAt = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
      this.activity(item.companyId, actorId, 'onboarding', `${item.title}: ${status.replace('_', ' ')}`);
    });
  }

  close() {
    this.db.close();
  }

  async closeAsync() {
    this.close();
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    return this.get<UserRecord>(
      'SELECT id, name, email, role, color, passwordHash FROM users WHERE id = ?',
      id,
    );
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    return this.get<UserRecord>(
      'SELECT id, name, email, role, color, passwordHash FROM users WHERE email = ? COLLATE NOCASE',
      email,
    );
  }

  async getWorkspaceUser(): Promise<UserRecord | undefined> {
    this.db
      .prepare(
        `INSERT INTO users (id, name, email, role, color, passwordHash, createdAt)
      VALUES ('user-workspace', 'Shared workspace', 'workspace@goatara.invalid', 'admin', 'green', NULL, ?)
      ON CONFLICT(id) DO NOTHING`,
      )
      .run(new Date().toISOString());
    return this.getUser('user-workspace');
  }

  async hasUsers(): Promise<boolean> {
    return Boolean(this.get('SELECT id FROM users LIMIT 1'));
  }

  async insertUser(user: UserRecord) {
    this.insert('users', { ...user, createdAt: new Date().toISOString() });
  }

  async updatePassword(userId: string, passwordHash: string, currentTokenHash: string | null) {
    this.transaction(() => {
      this.db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, userId);
      if (currentTokenHash)
        this.db
          .prepare('DELETE FROM sessions WHERE userId = ? AND tokenHash <> ?')
          .run(userId, currentTokenHash);
      else this.db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
    });
  }

  async createSession(session: { tokenHash: string; userId: string; csrfToken: string; expiresAt: string }) {
    this.db.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(new Date().toISOString());
    this.insert('sessions', session);
  }

  async getSession(tokenHash: string): Promise<{ userId: string; csrfToken: string } | undefined> {
    return this.get<{ userId: string; csrfToken: string }>(
      'SELECT userId, csrfToken FROM sessions WHERE tokenHash = ? AND expiresAt > ?',
      tokenHash,
      new Date().toISOString(),
    );
  }

  async deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
  }
}
