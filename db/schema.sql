-- AR Suite schema — Neon Postgres
-- Two companies (PPM, PSMS) share this schema; every business table is scoped by company_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Companies (PPM / PSMS) — the top-level scope selected at the start of a session
-- ---------------------------------------------------------------------------
create table companies (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,        -- 'PPM', 'PSMS'
  name          text not null,                -- full legal name shown on statements
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Users — individual logins (auth identity itself lives in Neon Auth / Better Auth;
-- this table holds app-level profile + which companies a user may access)
-- ---------------------------------------------------------------------------
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  text unique not null,   -- id from the auth provider
  email         text unique not null,
  full_name     text not null,
  role          text not null default 'staff',  -- 'admin' | 'staff'
  created_at    timestamptz not null default now()
);

create table user_company_access (
  user_id       uuid not null references app_users(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  primary key (user_id, company_id)
);

-- ---------------------------------------------------------------------------
-- Customers — master list per company. Type drives statement/classification logic
-- ('GVT' | 'PVT' | 'SEMI'), matching the existing sectorOf() rules.
-- ---------------------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,
  type           text not null default 'PVT' check (type in ('GVT','PVT','SEMI')),
  status         text not null default 'active' check (status in ('active','inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, name)
);
create index idx_customers_company on customers(company_id);

create table customer_contacts (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  contact_name   text,
  role           text,            -- e.g. 'Finance Officer', 'Procurement'
  phone          text,
  email          text,
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_contacts_customer on customer_contacts(customer_id);

create table customer_addresses (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  label          text,            -- 'Head Office', 'Billing', etc.
  address_line   text,
  island         text,
  atoll          text,
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_addresses_customer on customer_addresses(customer_id);

-- ---------------------------------------------------------------------------
-- A/R Ageing snapshots — one row per uploaded report. This IS the history:
-- every upload is kept, never overwritten, so you can pull any past period.
-- ---------------------------------------------------------------------------
create table ar_snapshots (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  report_date    text,                 -- "As of" date parsed from the source file
  source_filename text,
  uploaded_by    uuid references app_users(id),
  uploaded_at    timestamptz not null default now(),
  raw_diagnostics jsonb            -- parser diagnostics/warnings, for traceability
);
create index idx_snapshots_company on ar_snapshots(company_id, uploaded_at desc);

create table ar_invoices (
  id             uuid primary key default gen_random_uuid(),
  snapshot_id    uuid not null references ar_snapshots(id) on delete cascade,
  customer_id    uuid references customers(id),
  customer_name_raw text not null,     -- name as it appeared in the source file
  txn_date       text,
  txn_type       text,
  number         text,
  po_number      text,
  due_date       text,
  amount         numeric(14,2) not null default 0,
  open_balance   numeric(14,2) not null default 0,
  pgs_raw        text,                 -- raw Pvt/GVT/Semi GVT value from the sheet
  status         text,
  status_class   text check (status_class in ('pending_moft','pending_payment', null)),
  details_pending text
);
create index idx_invoices_snapshot on ar_invoices(snapshot_id);
create index idx_invoices_customer on ar_invoices(customer_id);

-- ---------------------------------------------------------------------------
-- Payments received but not yet booked against a specific invoice
-- (replaces the old localStorage "Step 2" payments — now durable & company-scoped)
-- ---------------------------------------------------------------------------
create table payments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  snapshot_id    uuid references ar_snapshots(id) on delete set null,
  customer_id    uuid references customers(id),
  pay_date       date,
  reference      text,
  amount         numeric(14,2) not null default 0,
  entered_by     uuid references app_users(id),
  created_at     timestamptz not null default now()
);
create index idx_payments_company on payments(company_id);

-- ---------------------------------------------------------------------------
-- Follow-up log — one row per contact/chase attempt for a customer.
-- outcome captures how the conversation landed; next_action_date drives reminders.
-- ---------------------------------------------------------------------------
create table followups (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  followup_date   date not null default current_date,
  note            text not null,
  outcome         text not null check (outcome in (
                     'promised_date','paid','disputed','no_response','partial_payment','other'
                   )),
  promised_date   date,             -- populated when outcome = 'promised_date'
  amount_discussed numeric(14,2),
  next_action_date date,
  logged_by       uuid references app_users(id),
  created_at      timestamptz not null default now()
);
create index idx_followups_customer on followups(customer_id, followup_date desc);
create index idx_followups_company_period on followups(company_id, followup_date);

-- ---------------------------------------------------------------------------
-- Statement generation log — a record every time an SOA/PDF/Excel is produced
-- ---------------------------------------------------------------------------
create table statement_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  customer_id    uuid references customers(id),
  snapshot_id    uuid references ar_snapshots(id),
  kind           text not null,   -- 'pending_moft' | 'pending_payment' | 'combined' | 'soa'
  format         text not null,   -- 'pdf' | 'xlsx'
  generated_by   uuid references app_users(id),
  generated_at   timestamptz not null default now()
);
create index idx_statementlog_customer on statement_log(customer_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- Seed the two companies
-- ---------------------------------------------------------------------------
insert into companies (code, name) values
  ('PPM',  'PPM (please confirm full legal name)'),
  ('PSMS', 'Pro Synergy Medical Systems Pvt Ltd')
on conflict (code) do nothing;
