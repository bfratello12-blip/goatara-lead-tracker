# Goatara.com lead form integration

## Recommendation

Use Supabase for the deployed CRM database and keep the website on Vercel. Do not post from the browser directly to the CRM with a bearer secret, and do not deploy the current SQLite file to Vercel. Vercel functions are stateless and can lose local files between invocations.

The website's existing FormSubmit email workflow is retained. The website and CRM now use this additive flow:

```text
goatara.com form
  -> FormSubmit email (existing AJAX request and native POST fallback)
  -> website Vercel /api/save-lead function
       -> CRM /api/intake/leads -> Supabase -> company + submission history
       -> existing optional Google Sheets copy
```

The website function owns the secret. The browser creates a separate random submission ID and sends only to its own same-origin `/api/save-lead` relay, in addition to the unchanged email request. A transport retry uses the same ID; it is unrelated to conversion or attribution IDs. CRM delivery starts independently so the native email fallback is also covered.

## Form mapping

The current live form shown on goatara.com maps as follows:

| Form field                                  | CRM field          |
| ------------------------------------------- | ------------------ |
| Where are you at right now?                 | `currentSituation` |
| Link to your store, listings or products    | `storeUrl`         |
| What do you sell?                           | `products`         |
| Roughly how many products?                  | `productCount`     |
| Current monthly revenue across all channels | `monthlyRevenue`   |
| How would orders get shipped?               | `shippingMethod`   |
| When would you want to start?               | `desiredStart`     |
| Full name                                   | `fullName`         |
| Business name                               | `businessName`     |
| Email                                       | `email`            |
| Phone                                       | `phone`            |

The current public form makes `businessName` optional. The CRM adapter accepts that and initially names the record `Unconfirmed - First Last`; the team can rename it after the lead arrives.

The current form's request body should be normalized to this canonical payload:

```ts
{
  currentSituation: form.current_stage,
  storeUrl: form.store_url || null,
  products: form.product_category,
  productCount: form.sku_count || null,
  monthlyRevenue: form.revenue_range,
  shippingMethod: form.fulfillment_method,
  desiredStart: form.launch_timeline,
  fullName: form.name,
  businessName: form.company || null,
  email: form.email,
  phone: form.phone
}
```

The website relay maps the current snake_case field names above and excludes all attribution fields. The CRM also retains support for older aliases: `firstName`, `lastName`, `whereDoYouSellToday`, and `tellUsAboutProducts`. No CRM form redesign or intake schema change is needed.

## Website relay behavior

The website's existing `api/save-lead.js` now:

1. Accepts `POST` only.
2. Validates JSON, size, field types/lengths, required fields, submission IDs, same-origin browser requests and the existing honeypot.
3. Forwards the browser's stable submission ID as `Idempotency-Key` on every CRM attempt.
4. Calls the CRM from the server with an HTTPS URL and bearer secret. It never connects directly to Supabase and never forwards secrets through browser code.
5. Returns `ok: true` only for a valid CRM acknowledgement. The existing visible form success state still depends on email delivery, not CRM delivery.
6. Makes at most three CRM attempts for network failures, timeouts, `429` or `5xx`, with five-second timeouts and short backoff. Other rejections are not retried. The website function has a 30-second execution budget.
7. Logs delivery failures with the submission ID, status/attempt and provider request ID when available, without full payloads or secrets.
8. Awaits CRM and optional Sheets requests independently before ending the function. Failure in either cannot suppress the other or the browser's existing email workflow.

Configure Vercel Firewall rate limiting/bot rules for the public website relay before launch; origin checks and a honeypot are not a distributed abuse limit. The CRM intake also has its existing 60 requests/minute/IP limit. There is no durable retry queue: persistent CRM failures require log review and recovery from the existing email notification. Do not resend the email merely to retry CRM intake.

The website function uses only these server-side integration variables:

```text
CRM_INTAKE_URL
CRM_INTAKE_SECRET
CRM_VERCEL_PROTECTION_BYPASS # only if CRM Vercel Deployment Protection requires it
GOATARA_SHEETS_URL          # existing optional copy; retain current value
GOATARA_SHEETS_SECRET       # existing optional copy; retain current value
```

Do not add Supabase database credentials or service-role keys to the website. No new FormSubmit or conversion-provider variables are needed.

## CRM matching and history

The existing intake contract remains:

```http
POST ${CRM_INTAKE_URL}/api/intake/leads
Authorization: Bearer ${CRM_INTAKE_SECRET}
Idempotency-Key: ${stableSubmissionId}
Content-Type: application/json
```

The endpoint requires a configured bearer secret of at least 32 characters, independently of CRM login/session authentication. It returns only `companyId`, `created` and `replayed`; the public website relay does not expose the company ID.

Company matching uses case-insensitive contact email or a normalized website key, not business name. Ordinary store URLs match by host without `www`; shared marketplaces match by host and seller/listing path, and a bare marketplace host does not match a company. Ambiguous matches and an existing contact with a different store return `409` for review.

New submissions fill only missing company details, preserve sales/client status and add complete history. An identical idempotency key and normalized payload replay adds neither a company nor history; changed details under the same key return `409`. A genuinely new ID adds history even if the company already exists.

The Postgres adapter uses structural JSON comparison, the driver's JSON API for object-valued JSONB, and a transaction-scoped advisory lock before intake matching. Concurrent intake cannot race to create duplicate companies. Older double-encoded JSON-string history remains readable and replayable without a migration. SQLite's existing intake behavior is unchanged.

Production uses the Supabase-backed API/UI on Vercel or another Node host; local SQLite is for development, not stateless Vercel deployment. Keep credentials server-side. The current default is direct workspace access (`AUTH_DISABLED=true`): anyone who can reach an unprotected URL can read and edit records. Retain external deployment protection or the existing application authentication policy; do not disable protection merely to let the website call intake.

## Deployment steps

Both projects are now connected in code. Configure and deploy both projects; live inbox delivery and deployed credentials still need verification. Existing Supabase installations need no new migration for these intake fixes.

The old CRM example environment file contained live-looking credentials. They have been removed from the example, but rotate the database password and intake secret if used; Git history still contains the old values. Update the CRM database connection and the matching secret on both deployments when rotating.

In Supabase:

1. Create a Supabase project.
2. Run [supabase/migrations/20260916000100_crm.sql](../supabase/migrations/20260916000100_crm.sql) in the SQL editor or with the Supabase CLI.
3. Copy the **transaction pooler** connection string into `SUPABASE_DB_URL`. Keep it server-only and URL-encode the password.
4. To import the existing private SQLite database, create `.env` with `DEMO_MODE=false`, `DATABASE_PATH` and `SUPABASE_DB_URL`, stop the local CRM server, then run:

```powershell
npm run db:migrate:supabase
```

The importer copies users, password hashes, companies, contacts, notes, tasks, onboarding, activities and submission history. It deliberately does not migrate sessions; direct access does not use them. Verify imported records before switching traffic.

In Vercel, set these Production environment variables:

```text
SUPABASE_DB_URL=<Supabase transaction pooler connection string>
APP_ORIGIN=https://crm.your-domain.example
COOKIE_SECURE=true
TRUST_PROXY=true
DEMO_MODE=false
AUTH_DISABLED=true
LEAD_WEBHOOK_SECRET=<32+ character random secret>
SUPABASE_DB_POOL_SIZE=5
```

Deploy this repository as the CRM project. `vercel.json` builds the frontend and routes `/api/*` to `api/index.ts`. The example above matches the existing direct-access configuration; retain application authentication if your deployment already enables it. With direct access, a shared workspace author is created on first access without changing existing records. External deployment protection must permit the authorized website server to reach intake, using the optional automation bypass header when needed. The intake bearer secret is still required.

In the goatara.com website Vercel project connected to the `northbound-commerce` repository, set these server-only variables and redeploy:

```text
CRM_INTAKE_URL=https://crm.your-domain.example
CRM_INTAKE_SECRET=<same value as the CRM LEAD_WEBHOOK_SECRET>
CRM_VERCEL_PROTECTION_BYPASS=<optional CRM Protection Bypass for Automation secret>
```

Keep the website's existing `GOATARA_SHEETS_URL` and `GOATARA_SHEETS_SECRET` if configured. They are not required for CRM delivery. No database credentials belong in this project. Scope Preview variables to a test CRM/database instead of accidentally sending test submissions into Production.

The browser keeps its FormSubmit request and calls the website's same-origin `/api/save-lead` route, never the CRM directly. The website relay forwards the canonical payload with the bearer secret and a stable `Idempotency-Key`. Keep existing FormSubmit recipient, CC and conversion settings unchanged.

Then run this verification sequence:

1. Deploy CRM, configure the website variables, then deploy the website.
2. Submit all eleven fields with a unique test email through the actual form. Coordinate with recipients because the live test sends a real notification.
3. Verify the original recipient and all CC inboxes, the unchanged success state and one existing Lead conversion for successful email AJAX delivery.
4. Confirm `/api/save-lead` returns `200` with `ok: true`; check the CRM company, contact, complete submission history and optional Sheets copy.
5. Replay only the website relay request with its original body and `submission_id`. CRM company/history counts must not increase. Do not resend the FormSubmit request. Sheets is not idempotent and may receive another copy.
6. Make a new form submission with the same email and changed details: one existing company, one new history entry, existing populated fields unchanged. Check optional business name, store URL and product count as well.
7. In Preview, verify CRM failure does not block email/success/conversion/Sheets, and that the native email fallback still starts CRM intake. Restore correct credentials afterward.
8. Repeat the successful flow on Production, checking actual inbox delivery, Supabase persistence and Vercel protection. Local browser tests use intercepted email/advertising requests and do not prove real inbox receipt.

## Local verification

Run `npm test`, `npm run build` and `npm run lint` in the CRM project. The website has `npm test` and `npm run check`; it remains a static site with serverless functions.

The optional `CRM_TEST_DATABASE_URL` is a **local test variable, not a Vercel setting**. To run the real Postgres regression, point it at a disposable database named `goatara_intake_test` on `127.0.0.1` or `localhost`, then run `npm test`. The test refuses other host/database names, uses a local non-TLS test connection, applies the existing schema and cleans up its test companies. It never uses `SUPABASE_DB_URL`. Without this variable, only that database-specific test is skipped.
