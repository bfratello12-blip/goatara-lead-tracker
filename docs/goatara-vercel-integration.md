# Goatara.com lead form integration

## Recommendation

Use Supabase for the deployed CRM database and keep the website on Vercel. Do not post from the browser directly to the CRM with a bearer secret, and do not deploy the current SQLite file to Vercel. Vercel functions are stateless and can lose local files between invocations.

The CRM repository now includes the Supabase schema, Postgres adapter, SQLite importer, and Vercel API entry. The safest small-team flow is:

```text
goatara.com form
  -> Vercel server-side /api/leads function
  -> Vercel API /api/index.ts
  -> Supabase Postgres
  -> submissions table
  -> CRM company matching + submission history
```

The Vercel function owns the secret and creates a stable idempotency key. The browser only submits the form to its own same-origin `/api/leads` route.

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
  currentSituation: form.currentSituation,
  storeUrl: form.storeUrl || null,
  products: form.products,
  productCount: form.productCount || null,
  monthlyRevenue: form.monthlyRevenue,
  shippingMethod: form.shippingMethod,
  desiredStart: form.desiredStart,
  fullName: form.fullName,
  businessName: form.businessName || null,
  email: form.email,
  phone: form.phone || null
}
```

The existing CRM endpoint also accepts the live form's raw names: `firstName`, `lastName`, `whereDoYouSellToday`, and `tellUsAboutProducts`. It combines first and last name, maps the two descriptive fields, discards unknown tracking fields, and validates the result.

## Required Vercel function behavior

Create a server-side route in the goatara.com repository, for example `api/leads.ts` or `app/api/leads/route.ts` depending on the framework. It should:

1. Accept `POST` only.
2. Validate the body and reject malformed submissions with `400`.
3. Create an idempotency key from the form's submission ID if the form already has one. Otherwise generate a UUID before delivery and persist it with the request.
4. Call the private CRM/Supabase endpoint from the server. Keep the secret in a Vercel Environment Variable, never in browser JavaScript or a `VITE_` variable.
5. Return a friendly success response to the form only after the submission is durably stored.
6. Return a friendly retry message for `429`, network, and `5xx` failures. Do not show internal errors to the lead.
7. Log the provider request ID and idempotency key, but never log the bearer secret or full lead payload.
8. Rate-limit the public route and add spam protection appropriate to the existing form. Supabase RLS should still prevent public reads.

The function should use these Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   # server-only; never NEXT_PUBLIC_ or VITE_
CRM_INTAKE_URL              # only if forwarding to the current CRM API
CRM_INTAKE_SECRET           # only if forwarding to the current CRM API
```

## Two deployment options

### Option A: transitional bridge

Deploy the current CRM API on a small persistent Node host and set `CRM_INTAKE_URL` to its HTTPS URL. The Vercel function forwards the canonical payload with:

```http
POST ${CRM_INTAKE_URL}/api/intake/leads
Authorization: Bearer ${CRM_INTAKE_SECRET}
Idempotency-Key: ${stableSubmissionId}
Content-Type: application/json
```

This is the fastest way to connect the live form, but it leaves SQLite and the CRM server outside Vercel.

### Option B: recommended final deployment

Deploy the Supabase-backed CRM API/UI on Vercel or another Node host. Company matching, conversion, notes, contacts, tasks, onboarding, and submission history remain server-side. The CRM opens directly without application login. Anyone who can reach its URL can read and edit all records; use external deployment protection or a private network for privacy. Do not expose database credentials to the browser.

Option B is the better long-term choice because it gives the Vercel deployment durable storage, backups, concurrent access, and a clean path to multiple CRM users. The current UI and business rules can be retained; the database adapter is the part that needs to change.

## Deployment steps

The CRM workspace still does not contain the goatara.com source repository, so its form submission handler cannot be edited from this folder. The CRM side is ready for deployment.

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

Deploy this repository as the CRM project. `vercel.json` builds the frontend and routes `/api/*` to `api/index.ts`. No account setup is required. A shared workspace author is created on first access without changing existing records. External deployment protection must still permit the authorized website server to reach the bearer-protected intake endpoint.

In the goatara.com Vercel project, add the server-side form handler and set:

```text
CRM_INTAKE_URL=https://crm.your-domain.example
CRM_INTAKE_SECRET=<same value as the CRM LEAD_WEBHOOK_SECRET>
```

The public form must call the website's same-origin route, not the CRM directly. The website route forwards the canonical payload to `${CRM_INTAKE_URL}/api/intake/leads` with `Authorization: Bearer ${CRM_INTAKE_SECRET}` and a stable `Idempotency-Key`.

Then run this verification sequence:

1. Add the Vercel `/api/leads` function to the website repository.
2. Configure server-only Vercel environment variables.
3. Run a test submission using a unique idempotency key.
4. Confirm the company appears in CRM with all fields and a submission-history entry.
5. Submit the same request again and confirm it does not create a duplicate company or duplicate submission.
6. Submit the same email with changed details and confirm the existing company is updated only where fields were missing.
7. Deploy and test the production domains.
