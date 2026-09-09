# LabFlow — Phase 0 Foundation

Self-hosted Lab Information System (LIS) to replace rented xMed. This is the
**Phase 0 foundation**: a runnable Next.js app with the full database schema,
authentication, role-based access control, bilingual UI (English-first, Urdu
toggle), and the app shell (login → dashboard).

> Design docs live in `../docs/`. Roadmap in `../docs/07-roadmap.md`.

## What works right now (Phase 0)
- ✅ Next.js 14 (App Router) + TypeScript + Tailwind
- ✅ **Full Prisma schema** for the whole system (`prisma/schema.prisma`)
- ✅ **Auth.js** credentials login + session
- ✅ **RBAC**: permissions, roles, server-side `requirePermission` guard
- ✅ Protected staff area via middleware
- ✅ **Bilingual** UI (English default, one-tap Urdu with RTL)
- ✅ App shell: top bar, sidebar, dashboard with status colour system
- ✅ Seed: roles, permissions, a branch, an admin user, and a sample
  test catalog (Lipid Profile) with a **correctly unit-less ratio** and an
  **LDL formula** — demonstrating the fixes for xMed's calculation bugs
- ✅ Docker Compose for Postgres + Redis + MinIO
- ✅ Security headers preconfigured (`next.config.mjs`)

Not yet built (later phases): booking, workboard, result entry, billing,
reports, portal — see the roadmap.

## Prerequisites
- Node.js 20+
- Docker (for Postgres/Redis/MinIO) — or your own Postgres

## Setup
```bash
# 1. Start datastores
docker compose up -d

# 2. Install deps
npm install

# 3. Configure env
cp .env.example .env
#   then set AUTH_SECRET:  openssl rand -base64 32

# 4. Create the database schema
npx prisma migrate dev --name init

# 5. Seed roles, admin user, and sample catalog
npm run db:seed

# 6. Run
npm run dev
#   → http://localhost:3000
```

## First login
```
Username: admin
Password: admin123      ← change this immediately after logging in
```

## Project layout
```
prisma/schema.prisma      Full data model (docs/02)
prisma/seed.ts            Roles, permissions, admin, sample tests
src/app/                  Routes: (auth)/login, (staff)/dashboard
src/core/auth/            Auth.js config
src/core/rbac/            Permissions + server-side guard
src/core/db/              Prisma client
src/core/i18n/            English/Urdu dictionaries + provider
src/components/           UI + layout (Sidebar, Topbar, StatusBadge...)
src/middleware.ts         Route protection
```

## Handy commands
| Command | Does |
|---|---|
| `npm run dev` | Start dev server |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:seed` | Seed data |
| `npm run db:studio` | Browse the DB (Prisma Studio) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |

## Security notes
- Passwords hashed with bcrypt; sessions via Auth.js JWT.
- RBAC enforced **server-side** (`requirePermission`), not by hiding UI.
- Security headers set in `next.config.mjs`.
- Change `admin123` and generate a real `AUTH_SECRET` before any real use.
- See `../vulnerabilities.md` for the full hardening checklist tracked into later phases.
