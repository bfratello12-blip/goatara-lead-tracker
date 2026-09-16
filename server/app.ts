import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { resolve } from 'node:path';
import { AppError } from './store.ts';
import {
  Sessions,
  createUserAsync,
  hashPassword,
  safeEqual,
  verifyPassword,
  type AppConfig,
  type AuthContext,
  type AuthStore,
} from './auth.ts';
import {
  createCompanySchema,
  companyPatchSchema,
  noteSchema,
  contactSchema,
  taskSchema,
  taskPatchSchema,
  onboardingSchema,
  onboardingPatchSchema,
  loginSchema,
  parseWebsiteLead,
  userSchema,
  passwordSchema,
} from '../shared/validation.ts';

const context = (response: Response) => response.locals.auth as AuthContext;
const parameter = (request: Request, key: string) => z.string().min(1).max(100).parse(request.params[key]);

export function createApp(store: AuthStore, config: AppConfig) {
  if (config.production && config.demoMode) throw new Error('Demo mode cannot be enabled in production');
  const app = express();
  const sessions = new Sessions(store, config);
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      strictTransportSecurity: config.cookieSecure ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.cookieSecure ? [] : null,
        },
      },
    }),
  );
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_request, response) => response.json({ ok: true }));

  app.post(
    '/api/intake/leads',
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }),
    async (request, response) => {
      if (!config.webhookSecret || config.webhookSecret.length < 32)
        throw new AppError('Website intake is not configured', 503);
      const bearer = request.get('authorization') ?? '';
      if (!safeEqual(bearer, `Bearer ${config.webhookSecret}`)) throw new AppError('Unauthorized', 401);
      const input = parseWebsiteLead(request.body);
      const key = z.string().min(1).max(200).optional().parse(request.get('idempotency-key')) ?? null;
      const result = await store.ingestLead(input, key);
      response
        .status(result.created ? 201 : 200)
        .json({ companyId: result.company.id, created: result.created, replayed: result.replayed });
    },
  );

  app.use('/api', (request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sessions.validOrigin(request))
      throw new AppError('Request origin is not allowed', 403);
    next();
  });

  app.post(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }),
    async (request, response) => {
      const input = loginSchema.parse(request.body);
      const { user, csrfToken } = await sessions.login(input.email, input.password, response);
      response.json({ user, csrfToken, demoMode: config.demoMode });
    },
  );

  app.use('/api', async (request, response, next) => {
    const auth = await sessions.resolve(request);
    if (!auth) throw new AppError('Sign in to continue', 401);
    response.locals.auth = auth;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !safeEqual(request.get('x-csrf-token') ?? '', auth.csrfToken)
    )
      throw new AppError('Your session changed. Refresh the page and try again.', 403);
    next();
  });

  app.get('/api/auth/me', (_request, response) => {
    const { user, csrfToken } = context(response);
    response.json({ user, csrfToken, demoMode: config.demoMode });
  });
  app.post('/api/auth/logout', async (_request, response) => {
    await sessions.logout(context(response), response);
    response.status(204).end();
  });
  app.post('/api/auth/password', async (request, response) => {
    if (config.demoMode) throw new AppError('Password changes are disabled in the demo workspace');
    const input = passwordSchema.parse(request.body);
    const auth = context(response);
    const user = await store.getUser(auth.user.id);
    if (!user) throw new AppError('Team member not found', 404);
    if (!verifyPassword(input.currentPassword, user.passwordHash))
      throw new AppError('Current password is incorrect');
    await store.updatePassword(user.id, hashPassword(input.newPassword), auth.tokenHash);
    response.status(204).end();
  });

  app.get('/api/workspace', async (_request, response) => response.json(await store.snapshot()));
  app.get('/api/settings', (_request, response) =>
    response.json({
      demoMode: config.demoMode,
      intakeConfigured: config.webhookSecret.length >= 32,
      intakePath: '/api/intake/leads',
      secureCookies: config.cookieSecure,
    }),
  );
  app.post('/api/team', async (request, response) => {
    if (context(response).user.role !== 'admin')
      throw new AppError('Only administrators can add team members', 403);
    if (config.demoMode) throw new AppError('Create team accounts in the private workspace, not the demo');
    response.status(201).json(await createUserAsync(store, userSchema.parse(request.body)));
  });

  app.post('/api/companies', async (request, response) => {
    response
      .status(201)
      .json(await store.createCompany(createCompanySchema.parse(request.body), context(response).user.id));
  });
  app.patch('/api/companies/:id', async (request, response) => {
    response.json(
      await store.updateCompany(
        parameter(request, 'id'),
        companyPatchSchema.parse(request.body),
        context(response).user.id,
      ),
    );
  });
  app.post('/api/companies/:id/notes', async (request, response) => {
    response
      .status(201)
      .json(
        await store.addNote(
          parameter(request, 'id'),
          noteSchema.parse(request.body),
          context(response).user.id,
        ),
      );
  });
  app.patch('/api/notes/:id', async (request, response) => {
    await store.pinNote(
      parameter(request, 'id'),
      z.object({ pinned: z.boolean() }).strict().parse(request.body).pinned,
    );
    response.status(204).end();
  });
  app.post('/api/companies/:id/contacts', async (request, response) => {
    const input = contactSchema.parse(request.body);
    response
      .status(201)
      .json(
        await store.addContact(
          parameter(request, 'id'),
          { ...input, email: input.email || null, phone: input.phone || null, title: input.title || null },
          context(response).user.id,
        ),
      );
  });
  app.patch('/api/contacts/:id', async (request, response) => {
    const input = contactSchema.parse(request.body);
    response.json(
      await store.updateContact(
        parameter(request, 'id'),
        { ...input, email: input.email || null, phone: input.phone || null, title: input.title || null },
        context(response).user.id,
      ),
    );
  });
  app.post('/api/tasks', async (request, response) => {
    const input = taskSchema.parse(request.body);
    response.status(201).json(
      await store.addTask(
        {
          ...input,
          dueAt: input.dueAt ?? null,
          contactId: input.contactId ?? null,
          assigneeId: input.assigneeId ?? null,
        },
        context(response).user.id,
      ),
    );
  });
  app.patch('/api/tasks/:id', async (request, response) => {
    response.json(
      await store.updateTask(
        parameter(request, 'id'),
        taskPatchSchema.parse(request.body),
        context(response).user.id,
      ),
    );
  });
  app.post('/api/companies/:id/onboarding', async (request, response) => {
    response
      .status(201)
      .json(
        await store.addOnboarding(
          parameter(request, 'id'),
          onboardingSchema.parse(request.body),
          context(response).user.id,
        ),
      );
  });
  app.patch('/api/onboarding/:id', async (request, response) => {
    await store.updateOnboarding(
      parameter(request, 'id'),
      onboardingPatchSchema.parse(request.body).status,
      context(response).user.id,
    );
    response.status(204).end();
  });
  app.use('/api', (_request, _response, next) => next(new AppError('Endpoint not found', 404)));

  if (config.production) {
    app.use(express.static(resolve('dist'), { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.sendFile(resolve('dist/index.html'));
    });
  }

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({
        message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    } else if (error instanceof AppError) {
      response.status(error.status).json({ message: error.message });
    } else if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ message: 'Request body must be valid JSON' });
    } else if (error instanceof Error && 'status' in error && error.status === 413) {
      response.status(413).json({ message: 'Request body is too large' });
    } else {
      console.error('Unhandled API error:', error instanceof Error ? error.message : 'Unknown error');
      response
        .status(500)
        .json({ message: 'Something went wrong. Your changes were not saved. Please try again.' });
    }
  });

  return app;
}
