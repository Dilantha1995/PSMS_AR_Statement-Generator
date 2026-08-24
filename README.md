# AR Suite

Multi-company A/R analysis, SOA generation, and customer follow-up tracking for
Pro Synergy Medical Systems (PSMS) and PPM, backed by Neon Postgres.

## What's here (v0.1)

- **Company switcher** — PPM / PSMS, everything else scoped from that pick
- **Upload history** — every A/R Ageing Detail Report ever uploaded is parsed and
  kept as an `ar_snapshots` row (see `lib/arEngine.js`, ported from the original
  `statement_generator_V5.html` parsing/classification logic — same rules, same
  GVT/PVT/Semi-GVT sector split)
- **Customer profiles** — contacts, addresses, notes, editable independently of
  whatever's in the Excel file
- **SOA generator** — same PDF/Excel output as the original tool
  (`lib/statementBuilders.js`), now driven by the database instead of local state
- **Follow-up log** — per-customer entries with an outcome (promised date / paid /
  disputed / partial / no response / other), plus a period report across one or
  all customers
- **Individual logins** via Better Auth (email/password), company access is
  granted per-user through `user_company_access`

## Not yet wired up (next pass)

- Admin screen to create user accounts and grant company access (for now, insert
  rows into `app_users` / `user_company_access` directly, or via Neon MCP)
- Payments entry screen (table + API route exist: `payments`) and the GVT MOFT
  sector dashboard/master-workbook exports from V5 haven't been ported into the
  DB-backed dashboard yet — the sector summary card is a first pass
- Bulk "download all statements as ZIP" (JSZip is installed, not wired into a route yet)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:migrate           # applies db/schema.sql
npx @better-auth/cli migrate # creates Better Auth's own users/sessions tables
npm run dev
```

Then create your first user + grant company access (no admin UI yet):

```sql
insert into app_users (auth_user_id, email, full_name, role)
values ('<id from better_auth users table>', 'you@company.com', 'Your Name', 'admin');

insert into user_company_access (user_id, company_id)
select u.id, c.id from app_users u, companies c where u.email = 'you@company.com';
```

## Deployment

Deployed via Vercel, database on Neon. Environment variables (`DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) are set as Vercel project env vars —
see the accompanying deployment notes for the live URL and project details.
