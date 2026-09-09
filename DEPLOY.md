# LabFlow — Deployment (Production)

The demo you've been viewing runs on a **throwaway SQLite** database for
convenience. The canonical target is **PostgreSQL** — the schema
(`prisma/schema.prisma`) declares `provider = "postgresql"`, validates cleanly
against Postgres, and the app code contains no SQLite-only branches.

## 1. Provision services (Docker)
```bash
docker compose up -d          # postgres + redis + minio (see docker-compose.yml)
```

## 2. Configure environment
```bash
cp .env.example .env
# Set a real secret:
#   AUTH_SECRET=$(openssl rand -base64 32)
# DATABASE_URL must be Postgres, e.g.:
#   DATABASE_URL="postgresql://labflow:labflow_pw@localhost:5432/labflow?schema=public"
```

## 3. Migrate + seed
```bash
npx prisma generate
npx prisma migrate deploy      # applies prisma/migrations to Postgres
npm run db:seed                # permissions, roles, first Owner account, catalogue
npm run db:sync-perms          # additive: grants any newly-added permission
npm run db:demo                # OPTIONAL — small demo dataset; skip for a real lab
```

`prisma/migrations/20260909000000_init` is the full schema as one migration:
39 tables, 19 enums, generated from `prisma/schema.prisma`. From here on, schema
changes go through `npx prisma migrate dev --name <change>` so Postgres and the
SQLite dev database stay in step.

**Local development uses SQLite** via `prisma/schema.sqlite.prisma`, which is
generated — never edit it. After changing `schema.prisma`:
```bash
npm run db:sqlite                                          # regenerate the SQLite schema
npx prisma db push --schema=prisma/schema.sqlite.prisma    # apply locally
npx prisma generate --schema=prisma/schema.sqlite.prisma   # refresh the client
# then restart the dev server — it holds the old client in memory
```

## 4. Build + run (production)
```bash
npm run build
npm start                      # serves on :3000 — light on memory
```
Put Nginx/Caddy in front for TLS and proxy to `:3000`.

## 5. First login
`admin / admin123` — **change immediately** (top-right avatar → Account → Change
password). This is a published default; treat any install still using it as open.

The first account is seeded as **Owner**, the only role that may set commercial
policy (family-card rate, joining fee, result self-verification). Staff accounts
are then issued from Admin → Staff accounts: the owner creates the account, hands
over a one-time password, and the person is held on a change-password screen
until they choose their own.

## Security posture (implemented)
- CSP + HSTS + X-Frame-Options + nosniff + Referrer-Policy + Permissions-Policy
  (`next.config.mjs`).
- Passwords bcrypt-hashed; **login brute-force lockout** (5 fails → 15-min lock).
- RBAC enforced server-side on every action; separation of duties in results.
- Portal OTP flow (demo shows the code on screen — wire an SMS provider and move
  OTP/session state to Redis for production; see `vulnerabilities.md`).

## PWA
Installable (manifest + `icon.svg`); a service worker (`public/sw.js`) provides
network-first caching so visited pages survive brief connectivity drops.

## Notes vs. the SQLite demo
- `AuditLog.before/after` and `ParameterFormula.inputs` are stored as JSON text
  (`String`) — portable across both databases.
- Case-insensitive search uses `contains` (SQLite LIKE is already CI). For
  Postgres, add `citext`/`ILIKE` on name columns for CI name search (TODO noted
  in `catalog.service.ts`).

## Recommended before go-live
- Playwright e2e for the booking → result → approve → report flow.
- Nightly encrypted DB backups + a restore drill.
- Move rate-limit / OTP / session stores to Redis if running multiple instances.

---

## Deploying to Vercel

Vercel runs `vercel-build` (`prisma generate && prisma migrate deploy && next build`),
so the client is generated and migrations applied on every deploy.

**SQLite cannot be used on Vercel.** Serverless functions get an ephemeral,
read-only filesystem: a `file:` database would be wiped between requests and
lost on every deploy. A hosted Postgres is required — Vercel Postgres, Neon or
Supabase all work, since `prisma/schema.prisma` already targets `postgresql`.

The connection string does **not** have to be called `DATABASE_URL`. Vercel's
Postgres integration lets you choose the variable prefix, so the same database
may arrive as `POSTGRES_URL`, `STORAGE_URL`, `STORAGE_PRISMA_URL` and so on —
and Prisma, which only ever reads `DATABASE_URL`, then reports it as "an empty
string" on a database that is provisioned and healthy.

`scripts/vercel-build.mjs` and `src/core/db/database-url.ts` resolve it at build
time and at runtime, in this order:

```
DATABASE_URL → POSTGRES_PRISMA_URL → STORAGE_PRISMA_URL
             → POSTGRES_URL_NON_POOLING → STORAGE_URL_NON_POOLING
             → DATABASE_URL_UNPOOLED → POSTGRES_URL → STORAGE_URL
```

Migrations separately prefer a direct (non-pooled) URL — `DIRECT_URL`, or any
`*_NON_POOLING` variant — because the advisory locks they take are commonly
refused through a pooler.

So attaching the database is usually enough. The only variables you must add by
hand are:

| Name | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |

After the first successful deploy, seed once from your machine against the same
database:

```bash
DATABASE_URL="<the same URL>" npm run db:seed
DATABASE_URL="<the same URL>" npm run db:sync-perms
# optional, for a demo instance only:
DATABASE_URL="<the same URL>" npm run db:demo
```

Then sign in as `admin` / `admin123` and change the password immediately — the
instance is on the public internet from the moment it deploys.
