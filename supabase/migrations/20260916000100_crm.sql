create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'member')),
  color text not null,
  password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id text primary key,
  name text not null,
  stage text not null check (stage in ('new', 'contacted', 'discovery', 'proposal', 'won', 'lost')),
  client_status text check (client_status in ('onboarding', 'active', 'paused', 'cancelled')),
  owner_id text references public.users(id),
  deal_value numeric not null default 0 check (deal_value >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_since date,
  follow_up_at date,
  expected_close_at date,
  lost_reason text,
  tags jsonb not null default '[]'::jsonb,
  color text not null,
  current_situation text,
  store_url text,
  store_key text,
  products text,
  product_count text,
  monthly_revenue text,
  shipping_method text,
  desired_start text,
  constraint companies_client_status_requires_won check (client_status is null or stage = 'won')
);
create index if not exists companies_stage_idx on public.companies(stage);
create index if not exists companies_client_idx on public.companies(client_status);
create index if not exists companies_store_idx on public.companies(store_key);

create table if not exists public.contacts (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  title text,
  is_primary boolean not null default false
);
create index if not exists contacts_company_idx on public.contacts(company_id);
create index if not exists contacts_email_idx on public.contacts(lower(email));
create unique index if not exists contacts_one_primary_idx on public.contacts(company_id) where is_primary;
create unique index if not exists contacts_company_email_idx on public.contacts(company_id, lower(email)) where email is not null;

create table if not exists public.notes (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  author_id text not null references public.users(id),
  content text not null,
  kind text not null check (kind in ('note', 'call', 'meeting')),
  pinned boolean not null default false,
  created_at timestamptz not null
);
create index if not exists notes_company_date_idx on public.notes(company_id, created_at desc);

create table if not exists public.tasks (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  contact_id text references public.contacts(id),
  assignee_id text references public.users(id),
  title text not null,
  due_at date,
  priority text not null check (priority in ('low', 'normal', 'high')),
  completed_at timestamptz,
  created_at timestamptz not null
);
create index if not exists tasks_company_idx on public.tasks(company_id);
create index if not exists tasks_due_idx on public.tasks(completed_at, due_at);

create table if not exists public.onboarding (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  title text not null,
  category text not null check (category in ('setup', 'access', 'launch')),
  status text not null check (status in ('needed', 'requested', 'received', 'not_required')),
  updated_at timestamptz not null,
  position integer not null,
  unique(company_id, title)
);

create table if not exists public.activities (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  actor_id text references public.users(id),
  type text not null,
  description text not null,
  created_at timestamptz not null
);
create index if not exists activities_date_idx on public.activities(created_at desc);
create index if not exists activities_company_idx on public.activities(company_id, created_at desc);

create table if not exists public.submissions (
  id text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  received_at timestamptz not null,
  payload jsonb not null,
  idempotency_key text unique
);
create index if not exists submissions_company_idx on public.submissions(company_id);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  csrf_token text not null,
  expires_at timestamptz not null
);
create index if not exists sessions_expiry_idx on public.sessions(expires_at);

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.onboarding enable row level security;
alter table public.activities enable row level security;
alter table public.submissions enable row level security;
alter table public.sessions enable row level security;

comment on schema public is 'Goatara CRM schema. Application access uses the server-side Supabase pooler role; browser clients have no direct database access.';