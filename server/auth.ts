import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppError, Store, type UserRecord } from './store.ts';
import type { TeamMember } from '../shared/crm.ts';

export interface AppConfig {
  production: boolean;
  demoMode: boolean;
  appOrigin: string;
  deploymentOrigins?: string[];
  cookieSecure: boolean;
  trustProxy: boolean;
  webhookSecret: string;
  supabaseDbUrl?: string;
  authDisabled?: boolean;
}

export interface AuthContext {
  user: TeamMember;
  csrfToken: string;
  tokenHash: string | null;
}

export type AuthStore = Store | import('./postgres-store.ts').PostgresStore;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function publicUser(user: UserRecord): TeamMember {
  return { id: user.id, name: user.name, email: user.email, role: user.role, color: user.color };
}

export function createUser(
  store: Store,
  input: { name: string; email: string; password: string; role: TeamMember['role'] },
): TeamMember {
  if (store.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', input.email))
    throw new AppError('A team member with this email already exists', 409);
  const user: UserRecord = {
    id: randomUUID(),
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    color: input.role === 'admin' ? 'green' : 'blue',
    passwordHash: hashPassword(input.password),
  };
  store.insert('users', { ...user, createdAt: new Date().toISOString() });
  return publicUser(user);
}

export async function createUserAsync(
  store: AuthStore,
  input: { name: string; email: string; password: string; role: TeamMember['role'] },
): Promise<TeamMember> {
  if (await store.getUserByEmail(input.email))
    throw new AppError('A team member with this email already exists', 409);
  const user: UserRecord = {
    id: randomUUID(),
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    color: input.role === 'admin' ? 'green' : 'blue',
    passwordHash: hashPassword(input.password),
  };
  await store.insertUser(user);
  return publicUser(user);
}

export class Sessions {
  store: AuthStore;
  config: AppConfig;
  demoCsrf = randomBytes(32).toString('base64url');
  dummyHash = hashPassword(randomBytes(32).toString('hex'));

  constructor(store: AuthStore, config: AppConfig) {
    this.store = store;
    this.config = config;
  }

  async resolve(request: Request): Promise<AuthContext | null> {
    if (this.config.authDisabled) {
      const user = this.config.demoMode
        ? await this.store.getUser('user-alex')
        : await this.store.getWorkspaceUser();
      return user ? { user: publicUser(user), csrfToken: '', tokenHash: null } : null;
    }
    if (this.config.demoMode) {
      const user = await this.store.getUser('user-alex');
      return user ? { user: publicUser(user), csrfToken: this.demoCsrf, tokenHash: null } : null;
    }
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('goatara_session='))
      ?.slice('goatara_session='.length);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.store.getSession(tokenHash);
    if (!session) return null;
    const user = await this.store.getUser(session.userId);
    return user ? { user: publicUser(user), csrfToken: session.csrfToken, tokenHash } : null;
  }

  async login(email: string, password: string, response: Response): Promise<AuthContext> {
    const user = await this.store.getUserByEmail(email);
    const valid = verifyPassword(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !valid) throw new AppError('Email or password is incorrect', 401);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const csrfToken = randomBytes(32).toString('base64url');
    const maxAge = 7 * 24 * 60 * 60;
    await this.store.createSession({
      tokenHash,
      userId: user.id,
      csrfToken,
      expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
    });
    response.setHeader(
      'Set-Cookie',
      `goatara_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.config.cookieSecure ? '; Secure' : ''}`,
    );
    return { user: publicUser(user), csrfToken, tokenHash };
  }

  async logout(context: AuthContext, response: Response) {
    if (context.tokenHash) await this.store.deleteSession(context.tokenHash);
    response.setHeader(
      'Set-Cookie',
      `goatara_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.config.cookieSecure ? '; Secure' : ''}`,
    );
  }

  validOrigin(request: Request): boolean {
    const origin = request.get('origin');
    if (!origin) return false;
    if (origin === this.config.appOrigin) return true;
    if (this.config.deploymentOrigins?.includes(origin)) return true;
    return !this.config.production && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
}
