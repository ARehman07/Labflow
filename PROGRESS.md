# LabFlow — Build Progress

Living tracker of the build. Updated as modules complete.
See `../docs/07-roadmap.md` for the full plan.

## Status legend
✅ Done & verified · 🔨 In progress · ⬜ To do

| # | Module / Area | Status | Verified |
|---|---------------|--------|----------|
| 0 | Foundation — auth, RBAC, i18n (EN/UR), layout, DB schema, seed, Docker | ✅ | Login + dashboard live |
| 1 | Reception — patient reg, booking, pricing, invoice, printable slip | ✅ | Booked slip 00001 end-to-end |
| 2 | Lab — workboard, state machine, result entry, **calc engine**, approval, audit | ✅ | Full pipeline + 24 unit tests |
| 3 | Billing — invoices, payments, due/paid filters, refunds, audit | ✅ | Payment → PAID verified |
| 4 | Reporting — clinical report document, print/PDF, staff report page | ✅ | Report renders with flags/letterhead |
| 5 | Patient Portal — OTP report access (key xMed gap) | ✅ | Mobile → OTP → report verified |
| — | UI overhaul — medical design system, animations, dropdown fix | ✅ | Verified across pages |
| 6 | Admin — test catalog editor, users, departments, doctors, branches | ✅ | Created a new test (TSH) via UI |
| 7 | Referral — doctor commission auto-accrual + payout, B2B partner labs | ✅ | Accrual + Mark-Paid verified |
| 8 | Finance — daily cash summary (by method), expense/income ledger | ✅ | Expense → net recomputed live |
| 9 | Insights — live dashboard KPIs, revenue/test-mix/doctor charts, pipeline | ✅ | Aggregations verified w/ demo data |
| 10 | Queue — auto tokens, call-next management + fullscreen display screen | ✅ | Call-next + live display verified |
| 11 | Polish — PWA, report QR, CSP + login lockout, Postgres-ready, DEPLOY.md | ✅ | Headers + PWA + QR verified live |

| 12 | Tenancy — Tenant model, tenantId on 29 models, isolation extension, lab code at login | ✅ | 36/36 tests, build passes |

| 13a | Clinical safety — panic thresholds, age-in-days ranges, critical callback loop, self-verify fix, notifiable register | ✅ | 49/49 tests |
| 13b | Safety worklists — /lab/critical and /lab/notifiable, EN+UR, sidebar, RBAC | ✅ | 53/53 tests, build passes |
| 14 | Family Card (R1) — mobile-as-identity cards, server-authoritative discount rules, /family-cards screen | ✅ | 73/73 tests, build passes |
| 15 | Portal hardening (G15) — DB-backed hashed OTP, rate limits, lab-code scoping, cross-tenant leak closed | ✅ | 90/90 tests, build passes |
| 16 | Tenant offboarding (G19) — ordered transactional delete, row counts, reused as the test fixture reset | ✅ | 96/96 tests, build passes |

**Done: 17 / 17.** Multi-tenant as of the tenancy pass; see
`../docs/08-gap-register.md` for what remains.

## Portal note
OTP and sessions are database-backed, hashed and rate-limited. The code is
returned to the client ONLY when `PORTAL_DEV_OTP=true` and not in production.
**Still to do before launch: wire a real SMS provider** — until then, nobody
receives a code outside local development.

## Quality gates (kept green every turn)
- `npm run typecheck` → 0 errors
- `npm run test` → 96/96 passing (expression, calc-engine, workflow, tenant coverage, isolation)
- `npm run build` → succeeds
- i18n EN/UR key parity → full
- Every module: Zod-validated, RBAC-guarded, transactional, audit-logged

## Verified user flows
- Login (admin) → dashboard
- New Booking → patient reg → test pricing → invoice → slip
- Lab: Collect → Start → Enter Results (LDL/ratio auto-calc, correct flags & units) → Approve (audit trail)
- Billing: Collect Payment → invoice PAID

## Notes
- Local demo runs on a throwaway SQLite DB; canonical schema/target is PostgreSQL.
- `prisma/schema.sqlite.prisma` is GENERATED from `schema.prisma` — never edit it.
  Regenerate with `npm run db:sqlite`.
- Tenancy has been exercised on SQLite only. Run the Postgres migration before release.
- Urdu UI uses Noto Sans Arabic (naskh) with fixed pill/RTL padding.
