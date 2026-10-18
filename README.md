# Outbound Engine

A self-hosted lead pipeline and lead-management system:

- **Lead archive** – hundreds/thousands of leads stored in PostgreSQL, imported from CSV (with column mapping and de-duplication by domain/email) or added by hand.
- **Weekly allocation** – admins/managers select leads in bulk and allocate them to a BDE for a chosen work week. BDEs see them under *My leads* for that week.
- **Working leads** – BDEs change status (New → Contacted → Qualified → Proposal → Won / Lost / Not interested) and leave comments; every change is logged in an activity timeline.
- **Teams, roles and access rules** – create roles with granular permissions, group users into teams, and restrict which part of the archive a role or team can see (by source, industry, country, tag or minimum AI score).
- **AI pre-filter** – a background worker reads each lead's website and asks a small model (GPT-4o-mini by default) to score fit against your ideal customer profile. The profile, criteria, thresholds and model are editable in the UI; you can test the prompt against any URL before saving.

Stack: Next.js 15 (App Router, server actions), TypeScript, Tailwind + shadcn/ui, Prisma + PostgreSQL 16, Auth.js (credentials), Vercel AI SDK + OpenAI.

---

## 1. Prerequisites

- Node.js 20+ (22 recommended) and [pnpm](https://pnpm.io) (`corepack enable` is enough).
- A PostgreSQL 14+ database. Either:
  - **Local (macOS, Homebrew):**
    ```bash
    brew install postgresql@16
    brew services start postgresql@16
    createdb lead_pipeline
    ```
    `DATABASE_URL` is then `postgresql://<your-mac-username>@localhost:5432/lead_pipeline?schema=public`.
  - **Hosted:** any Postgres URL works (Neon, Supabase, RDS, …). Paste it as `DATABASE_URL`.
  - **Docker:** see [section 5](#5-running-with-docker).
- (Optional) an OpenAI API key for the AI pre-filter. Everything else works without it.

## 2. Configure

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `AUTH_SECRET` | Random secret for session cookies. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Public URL of the app, e.g. `http://localhost:3000`. |
| `OPENAI_API_KEY` | Optional. Enables AI scoring. Leave empty to disable. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Credentials for the first admin created by the seed script. |
| `SEED_DEMO` | `true` creates a demo team, manager and two BDE accounts (all with password `password123`). Set to `false` for production. |
| `WORKER_CONCURRENCY` / `WORKER_POLL_MS` | How many sites the AI worker processes in parallel and how often it polls the queue. |

## 3. Install, migrate, seed

```bash
pnpm install
pnpm db:migrate      # creates the schema (uses prisma migrate dev)
pnpm db:seed         # default roles, admin user, lead sources, AI settings
```

In production use `pnpm db:deploy` instead of `db:migrate`.

## 4. Run

```bash
pnpm dev             # web app on http://localhost:3000
pnpm worker          # AI scoring worker (separate terminal; optional)
```

Default logins after seeding (change these immediately):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` (from `SEED_ADMIN_EMAIL`) | `admin1234` (from `SEED_ADMIN_PASSWORD`) |
| Manager (demo) | `manager@example.com` | `password123` |
| BDE (demo) | `bde1@example.com`, `bde2@example.com` | `password123` |

For production: `pnpm build && pnpm start`, and run `pnpm worker` as a long-lived process (systemd, pm2, or the Docker `worker` service).

## 5. Running with Docker

`docker-compose.yml` starts Postgres, the web app and the worker:

```bash
cp .env.example .env     # set AUTH_SECRET, OPENAI_API_KEY, seed credentials
docker compose up -d --build
```

The `web` service runs `pnpm db:deploy && pnpm db:seed` on every start (both are idempotent) before serving on http://localhost:3000. Data lives in the `pgdata` volume.

## 6. How it fits together

| Area | Where |
| --- | --- |
| Database schema | `prisma/schema.prisma` |
| Permissions and default roles | `src/lib/auth/permissions.ts` |
| Lead visibility rules (`leadAccessWhere`) | `src/lib/auth/lead-access.ts` |
| Lead actions (create, allocate, status, comments) | `src/lib/leads/actions.ts` |
| CSV import | `src/app/(app)/archive/import/`, `src/lib/leads/import-actions.ts` |
| Admin actions (users, teams, roles, access rules, sources) | `src/lib/admin/actions.ts` |
| AI: site fetcher, scoring prompt, job processing | `src/lib/ai/` |
| AI worker entrypoint | `scripts/worker.ts` |

### Permissions

Roles hold a list of permission strings (`leads.view_archive`, `leads.allocate`, `admin.users`, `ai.settings`, …). Three roles are seeded:

- **Admin** – everything.
- **Manager** – archive, import, allocate, manage users and teams, AI scoring.
- **BDE** – only their own allocated leads: update status and comment.

Roles are editable under *Roles & access*. A user can never grant a permission they do not hold themselves.

### Access rules

By default anyone with `leads.view_archive` sees the whole archive. Add an *access rule* targeting a role or team to narrow this (e.g. "Managers in the UK team only see leads where country = United Kingdom and AI score ≥ 50"). Users with `leads.view_all` bypass rules; BDEs always see leads allocated to them.

### Week-based allocation

Weeks start on Monday (UTC). When allocating you pick the target week; the lead appears in that BDE's *My leads* for that week. Changing the lead's status automatically moves the assignment from *To do* → *In progress* → *Done*.

### AI pre-filter

1. Leads with a website are queued (`AiScoringJob`) on import, on manual add, or via *Score with AI* in the archive.
2. The worker fetches the homepage plus up to *N* high-signal pages (about, services, pricing…), strips it to text and sends at most *max characters* to the model.
3. The model returns a structured `{ score 0–100, summary, reasons, detectedIndustry, disqualified }`. Scores above the "good" threshold are **Good fit**, below the "bad" threshold **Poor fit**, otherwise **Maybe**.
4. Results appear as badges in the archive and *My leads*, and in full on the lead detail page. Failed jobs can be retried from *AI pre-filter* in the admin menu.

Costs are small: with the defaults (~6,000 characters per site) scoring 1,000 leads with GPT-4o-mini costs well under a dollar.

## 7. Useful scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm worker` | AI scoring worker |
| `pnpm db:migrate` / `pnpm db:deploy` | Run migrations (dev / prod) |
| `pnpm db:seed` | Seed roles, admin, sources, AI settings |
| `pnpm db:studio` | Prisma Studio (browse the database) |
| `pnpm typecheck` / `pnpm lint` | Type and lint checks |
