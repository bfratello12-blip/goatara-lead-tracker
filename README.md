# Goatara CRM

A server-backed workspace for Goatara's sales and client relationships.

## Start locally

Prerequisite: Node.js 24 LTS or newer. Use the same Node major version in development and production. SQLite uses Node's built-in driver, which currently emits an experimental-feature warning. No separate database service is required.

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API listens on `127.0.0.1:3001`.

With no `.env`, development opens a clearly labeled **local demo** with fictional companies and team members. Demo changes persist in `data/goatara-demo.sqlite`. This mode does not require sign-in, is restricted to loopback, and is rejected in production. Do not put real customer data in the demo or expose the Vite development server to a network.

The sample company websites use reserved `.example` domains. They are illustrative records, not live client sites.

## Shared team workspace

1. Create `.env` using `.env.example` as the starting point. Keep `DEMO_MODE=false` and `DATABASE_PATH=data/goatara.sqlite`. This opens a separate, empty database and leaves the demo untouched.
2. Keep `AUTH_DISABLED=true` (the default). No account bootstrap or password is required.
3. Run `npm run dev` and open the URL. Add teammates in **Team** for ownership and task assignment without setting passwords.

Direct access has no application login or logout. Anyone who can reach the CRM URL can read, export, and edit all records and add teammates. Protect a hosted CRM with deployment protection, an identity-aware gateway, or a private network. A hard-to-guess URL is not access control. Keep the website intake accessible to its authorized server integration.

For development, `APP_ORIGIN` must match the browser origin. Both loopback hostnames are accepted in development. For a port conflict, set `PORT` and `VITE_PORT` to available API and frontend ports and restart; the Vite proxy follows `PORT`.

New notes and activity in the non-demo workspace use a dedicated **Shared workspace** author, created automatically on first access. Existing authors and records are preserved; direct access cannot identify individual visitors. Legacy backend session support remains, but `AUTH_DISABLED=false` is not supported by the no-login frontend.

## What is implemented

- Overview with live company and task counts, potential monthly retainers, overdue work, onboarding progress, and recent activity.
- Sales pipeline: **New lead -> Contacted -> Discovery -> Proposal -> Won / Lost**. Move prospects with drag-and-drop, their stage selector, or an accessible card action menu. Lost opportunities can be reopened.
- One persistent company record before and after signing. Marking it won sets its client start date and creates onboarding once; contacts, notes, tasks, submissions, and activity keep the same company ID.
- Client statuses: **Onboarding, Active, Paused, Cancelled**. A signed relationship retains its won sales history; retention changes use client status instead of moving the original deal back to lost.
- Company and primary/additional contact management, account ownership, editable start and follow-up dates, expected close, lost reason, tags, and monthly retainer.
- Append-only general, call, and meeting notes with authors and timestamps; pinning; workspace-wide note search. There is no fixed limit on the number of notes, and each entry supports up to 100,000 characters.
- A quick **Log a call** action and a note composer. `Ctrl/Cmd+Enter` saves. Unsaved notes are restored from this browser tab's session storage, including after refresh. Typing that occurs during an in-flight save is not cleared. Drafts are not shared across devices and are not a substitute for saving a note.
- Company/contact-linked tasks with assignees, due dates, priorities, completion and reopening; overdue, today, upcoming, and completed views.
- Flexible onboarding with agreement, billing, account access, creative, review, strategy, campaign, and launch items. Add custom items, track requested/received access, or mark irrelevant items **Not required**. Complete the required checklist to activate the client.
- Global company, contact, task and note search (`Ctrl/Cmd+K`), notification shortcuts, activity history, and responsive desktop/mobile navigation.
- JSON workspace export and verified online SQLite backups.

Deal value is currently a **monthly retainer in USD**, not a one-time contract total. Dashboard pipeline value and active-client revenue use that same convention. There is one current sales relationship per company; multiple simultaneous deals can be added as a separate entity later without duplicating companies.

## Website lead integration

See [docs/goatara-vercel-integration.md](docs/goatara-vercel-integration.md) for the recommended Vercel and Supabase deployment path and the exact mapping for the current public form.

The receiving endpoint is implemented and tested. **The existing public website is not present in this repository, so its submission handler still needs to be connected.** I confirmed the live contact form currently asks for first name, last name, email, optional phone, where the prospect sells today, and a product description. The CRM normalizer accepts those names as `firstName`, `lastName`, `email`, `phone`, `whereDoYouSellToday`, and `tellUsAboutProducts`; because that form does not ask for a business name, the first record is named `Unconfirmed - First Last` until the team updates it.

Set `LEAD_WEBHOOK_SECRET` to a securely generated random secret of at least 32 characters in the CRM server environment. Store the same secret in the website's **server-side** environment or a trusted form-automation service. Never put it in frontend JavaScript, a public form, a URL, or a `VITE_` variable. The intake route remains disabled with HTTP 503 until configured.

Submit from the website backend:

```http
POST /api/intake/leads
Authorization: Bearer <server-side secret>
Content-Type: application/json
Idempotency-Key: <stable, unique form-submission ID>
```

```json
{
  "currentSituation": "An established store, ready to grow",
  "storeUrl": "https://your-store.example",
  "products": "Home goods and accessories",
  "productCount": "25-50",
  "monthlyRevenue": "$25,000-$50,000",
  "shippingMethod": "Third-party fulfillment",
  "desiredStart": "Next month",
  "fullName": "Jordan Lee",
  "businessName": "Example Company",
  "email": "jordan@your-store.example",
  "phone": "+1 415 555 0100"
}
```

| Website question                            | API field          |
| ------------------------------------------- | ------------------ |
| Where are you at right now?                 | `currentSituation` |
| Link to your store, listings, or products   | `storeUrl`         |
| What do you sell?                           | `products`         |
| Roughly how many products?                  | `productCount`     |
| Current monthly revenue across all channels | `monthlyRevenue`   |
| How would orders get shipped?               | `shippingMethod`   |
| When would you want to start?               | `desiredStart`     |
| Full name                                   | `fullName`         |
| Business name                               | `businessName`     |
| Email                                       | `email`            |
| Phone                                       | `phone`            |

`businessName` is required by the canonical CRM payload, but the current public form can omit it: the adapter derives `Unconfirmed - First Last`. All other form fields may be omitted, `null`, or empty. An email, when provided, must be valid. Product count and revenue stay as text, preserving range answers from the website rather than forcing them into numbers. URLs are validated as HTTP(S), may omit the scheme, and are normalized. Unknown fields, including attribution/tracking parameters, are discarded.

### Matching and retries

- Each accepted submission is retained in the company's **Submission history**, even when the company already exists.
- Intake matches exact, case-insensitive contact email or normalized storefront hostname. Recognized shared marketplace hosts include the listing/shop path, so different sellers are not combined merely because they use Etsy, Amazon, or a similar marketplace.
- A match fills **missing** company fields and can add a contact. It never overwrites populated lead details, resets a sales stage or client status, or replaces notes. The new answers remain available in submission history.
- Conflicting identities return **409** instead of silently merging records. Keep the submission in the website's queue for human review; correct the conflicting records/identity and retry.
- Without an email or identifiable store, a new submission creates a company. Reliable retry deduplication therefore requires a stable `Idempotency-Key`. Exact-name-only merging is deliberately avoided.
- Retrying the same normalized payload with the same key returns the same company and does not append another submission. Reusing a key with changed data returns **409**.
- A new company returns **201**; a matched company or replay returns **200**. Responses contain only `companyId`, `created`, and `replayed`.
- Handle **400** validation errors and **409** conflicts for review. Retry **429**, network errors and **5xx** with exponential backoff, honoring `Retry-After` when supplied. The public website should persist/queue submissions before delivery so a CRM outage cannot lose a lead.

Website integrations require bearer authentication. Direct-access CRM mutations retain allowed-origin checks but do not require session cookies or CSRF tokens. Origin checks are not authorization. The intake secret is never returned by Settings.

## Architecture

| Area      | Implementation                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, React Router                                                                                                 |
| Interface | Radix dialogs/menus/tooltips, Lucide icons, locally bundled DM Sans and Manrope                                                          |
| Server    | Express 5 with Zod validation                                                                                                            |
| Storage   | SQLite, foreign keys, indexes, WAL, transactions, schema version migrations                                                              |
| Access    | Direct shared access; allowed-origin checks; bearer-secret protected website intake; external deployment protection required for privacy |
| Tests     | Node test runner for domain/API/security; Playwright for desktop and mobile                                                              |

```text
src/              Views, forms, reusable UI, and API client
shared/           Shared domain types and input schemas
server/           Database, business operations, authentication, routes, CLIs
tests/            Browser workflows and responsive checks
images/logos/     Original Goatara assets, unchanged
data/             Runtime databases and backups, excluded from version control
```

Companies own contacts, notes, tasks, onboarding items, submission history, and activities through foreign keys. Users remain separate authors/owners/assignees. Lifecycle changes and their related writes are transactional. Notes are append-only except for their pinned state. There are no destructive CRM record deletion endpoints.

For the initial small-team footprint, the authenticated UI fetches a workspace snapshot and searches it locally. It refreshes after mutations, on window focus, or with the refresh control. It is not a realtime push system. For a much larger dataset, add paginated server queries/full-text search behind the existing API rather than changing the company identity model. Concurrent edits to the same company field are currently last-write-wins; note entries remain independent.

## Production deployment

The production path now uses Supabase Postgres and includes a Vercel serverless entry at [api/index.ts](api/index.ts). Vercel serves the Vite build from `dist` and sends `/api/*` requests to the Express API backed by the Supabase pooler. The local Node server remains useful for development and can still run against SQLite when `DEMO_MODE` is enabled. Do not deploy the SQLite database onto ephemeral/serverless storage.

1. Create a Supabase project. In the Supabase SQL editor, run [supabase/migrations/20260916000100_crm.sql](supabase/migrations/20260916000100_crm.sql). Do not use the browser anon key for the CRM server; the schema intentionally has no public RLS policies.
2. Copy the Supabase **transaction pooler** connection string into `SUPABASE_DB_URL`. Use the pooler hostname and port for Vercel rather than a direct database connection. Keep the password URL-encoded.
3. Create a private `.env` with `DEMO_MODE=false`, `AUTH_DISABLED=true`, `SUPABASE_DB_URL`, `APP_ORIGIN=https://crm.your-domain.example`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and a 32+ character `LEAD_WEBHOOK_SECRET`.
4. If the current private SQLite workspace already contains data, stop the local server and run `npm run db:migrate:supabase` once. Sessions are intentionally not copied; direct access does not use them.
5. Configure external access protection before exposing customer data. The shared workspace identity is created automatically; no administrator bootstrap is required.
6. Import this repository into Vercel, set the same server-only environment variables for **Production**, and deploy. `vercel.json` builds `dist` and routes `/api/*` to the API function.
7. Configure the goatara.com Vercel project to forward its form server-side to the production CRM intake URL. See [docs/goatara-vercel-integration.md](docs/goatara-vercel-integration.md). Verify direct opening, external access protection, a real form submission, matching, and idempotent retry before using customer data.

The workspace is not preconfigured for an external identity provider, SMTP, or email/SMS reminders. Mail/phone links open the user's installed tools. Restrict Supabase/Vercel environment access and revoke access through your external gateway when a team member leaves, retaining their historical author record.

Do not store passwords, API tokens, or client access credentials in CRM notes. Access checklists track whether permission has been received, not the secret credentials themselves. SQLite and JSON exports contain private client information and are not application-encrypted; use encrypted disks/backups and restricted filesystem permissions.

### Backup and restore

```powershell
npm run db:backup
npm run db:backup -- D:\SecureBackups\goatara-2026-09-16.sqlite
```

The command uses SQLite's online backup API, including committed WAL changes, and checks the copy with `PRAGMA quick_check`. It refuses to overwrite existing files. It reads the same `.env` database path as the server. Without `.env`, it targets the local demo.

Schedule this command on the host, encrypt and copy backups off-host, and periodically test restoration. A JSON export is useful for portability but does **not** contain password hashes or sessions and is not a full restorable database backup.

To restore, stop every process connected to the database. Preserve the current database and any `-wal`/`-shm` files together, then point `DATABASE_PATH` at a new copy of the verified backup. Start the app and verify companies, contacts, notes, and sign-in before resuming work. Never replace a live SQLite file or copy only the main file while the server is writing. Restored session records can remain valid until expiry; revoke them when recovery follows a security incident.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start their own API/frontend on ports **3015/5175** with an in-memory database. They do not use or reset the normal demo/private files. Tests cover direct opening and refresh without accounts, password-free team creation, one-record conversion, lead fields and retries, draft recovery and in-flight typing, tasks, onboarding, search, navigation, mobile layouts and logo loading. Node tests also cover direct access, legacy authentication, CSRF, input validation, foreign-key relationships, durable persistence and verified backups. Screenshot and trace artifacts go to ignored `test-results/`. Use `npm run format` when editing the source.

No marketing attribution, UTM storage, click IDs, advertising tracking, or lead-source tracking is implemented.
