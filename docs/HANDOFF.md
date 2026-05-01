# Jamaat - project handoff

Use this doc to continue the project on another machine. Snapshot date: **2026-05-01**, current HEAD: **22698a2** (`Dashboards round 2 - error states, filters, expanded coverage`).

---

## 1. What this project is

**Jamaat** is a centralized donation, receipt, payment, and accounting platform for a Jamaat (community organisation). It digitizes:

- Receipt collection (cash + cheque + digital), printable receipts
- Payment vouchers + approval workflow
- Donation management (Commitments, Patronages, Qarzan Hasana loans, Returnable contributions)
- Internal accounting: chart of accounts, append-only ledger, financial periods, reports
- Member directory with families, sectors, organisation memberships
- Audit trail, error logs, reliability scoring, BI dashboards

Phase 1 = web only, single tenant live. Multi-tenant plumbing is wired everywhere from day one (`TenantId` on every tenant-scoped table + EF global query filters).

---

## 2. Locked architecture

All decisions confirmed 2026-04-21. **OSS-only**: no Syncfusion/DevExpress/Telerik/Duende/commercial libs.

| Layer | Choice |
|---|---|
| Backend | .NET 10 + ASP.NET Core 10 + EF Core 10 + Dapper (hybrid) |
| DB | MS SQL Server 2022. Schemas: `dbo`, `cfg`, `acc`, `txn`, `sync`, `audit` |
| Auth | ASP.NET Identity + JWT access + refresh tokens. Claims-based permissions (lazy policy provider) |
| Web | React 18 + Vite + TypeScript + Ant Design 5 + TanStack Query + react-hook-form + Zod + react-i18next |
| Charts | Recharts 3.8 |
| PDF | QuestPDF Community |
| Excel | ClosedXML |
| Jobs | Hangfire (free, SQL-backed) |
| Logs | Serilog -> Seq + File |
| Validation | FluentValidation |
| Mapping | Mapster |
| Tests | xUnit + Testcontainers-MSSQL + Playwright |
| Mobile (Phase 2) | Flutter + Drift + esc_pos_bluetooth |

**Volume target:** ~10K members, ~30-50K receipts/year. Hosting: on-prem Windows Server or Azure App Service for Containers, same Docker image.

**Cross-cutting rules:**
- Append-only `audit.AuditLog`, correlation IDs propagated on every request, `ProblemDetails` with traceId on errors.
- Append-only `LedgerEntry` - reversals = new balancing rows, never updates.
- Receipt/voucher numbering: SQL `UPDLOCK` on `cfg.NumberingSeries` row, same UoW transaction as the post.
- Bilingual infra (i18next, `name_ar`/`name_hi`/`name_ur` columns) in place from Phase 1; content filled in Phase 2.
- ITS integration is stubbed; manual Excel import/export with staging/review is the Phase 1 fallback.

Full original architecture plan (long-form): `C:\Users\niyas\.claude\plans\shiny-toasting-cook.md` (machine-local; not in repo - copy if you want it on the new PC).

---

## 3. Behavioral rules to keep using

These were captured in conversation memory across sessions. Re-prime any new Claude session with them.

### Rule 1 - Recommendations before choices
For any non-trivial technical choice (stack, library, architecture pattern), present **Claude's own recommendation + reasoning + brief alternatives as prose first**. Only fall back to a choice prompt if it's still ambiguous after that. Origin: 2026-04-21, when Claude fired four upfront stack-choice questions and the user said "I will answer, before I need to know your recommendations as well." Treat Claude's opinion as the anchor, not a neutral picker.

### Rule 2 - Never use em-dash; use hyphen
**Forbidden characters** anywhere (prose, code, comments, commit messages, UI strings, chat replies):
- `-` (U+2014 em-dash)
- `–` (U+2013 en-dash)

**Use:** `-` (U+002D plain hyphen-minus) only.

A project-wide sweep on 2026-04-29 replaced 453 em-dashes across 138 files. The bar going forward is **zero**. If you see one in any file you're editing or reading, fix it. After non-trivial UI string edits, run `grep` for `—` to confirm.

### Rule 3 - Plan-first for non-trivial work
For multi-step features, write `docs/PLAN-<feature>.md` before coding. The repo already follows this pattern (see [docs/](.) for examples). The plan captures: goal, phases, defaults locked in, out-of-scope, progress log. Update the progress log as you ship.

### Rule 4 - Work in batches with E2E coverage
Land features in cohesive batches: one batch = backend + frontend + Playwright spec + a clear commit message body. Recent batches in the log:
- `2b0ae1b E2E specs + planner doc for the detail-page UX uplift batch`
- `1412b8b E2E specs + planner doc for the QH form uplift`
- `5f68a7c E2E specs + planner for QH form v2 + guarantor consent uplift`

---

## 4. Repository layout

```
Jamaat/
+-- Jamaat.sln
+-- Directory.Build.props          # global C# props (net10.0, analyzers, NuGet audit)
+-- Directory.Packages.props       # central NuGet package versions
+-- global.json                    # pins .NET SDK 10.0.100 (rollForward: latestMinor)
+-- src/
|   +-- Jamaat.Domain/             # entities, value objects, abstractions, enums
|   +-- Jamaat.Application/        # services, DTOs, validators, mappers, DbContextFacade
|   +-- Jamaat.Infrastructure/     # EF DbContext, repos, Dapper, identity, audit, seed
|   +-- Jamaat.Contracts/          # shared DTOs surfaced to clients
|   +-- Jamaat.Api/                # controllers, middleware, Program.cs
+-- web/jamaat-web/                # React + Vite web portal
+-- mobile/                        # Flutter app (Phase 2, scaffolded)
+-- tests/                         # xUnit + Testcontainers + Playwright
+-- db/                            # local SQL backups (NOT committed - gitignored)
+-- deploy/                        # Docker / IIS deployment scaffolding
+-- docs/                          # PLAN-*.md per major feature batch + this HANDOFF
+-- models-Requirements/           # original requirement docs from the client
```

---

## 5. Setting up on a new PC

### 5.1 Prerequisites

- **Windows 10/11** (development is Windows-first; macOS/Linux work but may need cert tweaks)
- **.NET SDK 10.0.100** (matches `global.json`. `rollForward: latestMinor` allows newer 10.0.x)
- **Node.js 20 LTS** + npm (or pnpm)
- **MS SQL Server 2022 Developer Edition** (or LocalDB / Docker container; Express works for dev)
- **Git** with credentials configured for `https://github.com/niyaskc007/jamaat.git`
- Optional: **Seq** (logs viewer) at `http://localhost:5341`

### 5.2 Clone + bootstrap

```powershell
git clone https://github.com/niyaskc007/jamaat.git C:\Repos\Jamaat
cd C:\Repos\Jamaat

# Backend restore + build
dotnet restore
dotnet build

# Frontend deps
cd web\jamaat-web
npm install
```

### 5.3 Database

The default connection string assumes integrated Windows auth against `localhost`:

```
Server=localhost;Database=Jamaat;Integrated Security=true;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=true
```

If your SQL instance is named (e.g. `localhost\SQLEXPRESS`), edit `src/Jamaat.Api/appsettings.json` -> `ConnectionStrings.Default`.

Apply migrations + seed:

```powershell
# From repo root
dotnet ef database update --project src/Jamaat.Infrastructure --startup-project src/Jamaat.Api
```

`appsettings.Development.json` has `"Seed": { "DevData": true }`, so the first run of the API will also seed roles, permissions, sectors, fund types, and a few demo members.

If you have a `.bak` from the old PC: restore it via SSMS (`Tasks -> Restore -> Database`) to a database named `Jamaat`. The `.bak` is **not** committed (per .gitignore policy - it's binary and bloats history); copy it across via OneDrive / network share if you want the same data on the new machine.

### 5.4 Run dev

Two terminals:

```powershell
# Terminal 1 - API (HTTPS profile is what the frontend expects)
dotnet run --project src/Jamaat.Api --launch-profile https
# Listens on https://localhost:7024 + http://localhost:5174
```

```powershell
# Terminal 2 - Web
cd web\jamaat-web
npm run dev
# Vite dev server at http://localhost:5173
```

The web app's `VITE_API_BASE_URL` is `https://localhost:7024` (in `web/jamaat-web/.env.development`). On first load Chrome/Edge will warn about the dev cert; trust the ASP.NET dev cert with:

```powershell
dotnet dev-certs https --trust
```

### 5.5 Optional: Seq for log viewing

```powershell
docker run -d --name seq -e ACCEPT_EULA=Y -p 5341:80 datalust/seq
# Open http://localhost:5341
```

Without Seq the API still logs to console; the Seq sink just no-ops.

---

## 6. What's in the system today

### 6.1 Modules shipped

- **Members** + Member Profile (Phases A-H complete): clickable rows, age auto-compute, gender, social links, Hajj/Umrah, structured property details on address tab, master-driven origin dropdowns, multi-education, family read-only with self-edit verification queue, wealth declaration with `MemberAsset`, four new family roles seeded.
- **Families** with head + members, family tree visualiser, role labels, invariants enforced (reject head-as-member, duplicates, self-headship-transfer).
- **Commitments** (donation pledges with installment schedule).
- **Patronages** / Fund Enrollments.
- **Receipts** (Draft / Confirmed) with returnable + permanent intentions, multi-line, multi-currency, cheque mode.
- **Vouchers** with approval workflow and ledger posting on Paid.
- **Qarzan Hasana** loans v1 + v2: structured cashflow, gold backing, income sources, guarantor eligibility + remote consent portal at `/portal/qh-consent/:token`.
- **Post-dated cheques** workbench.
- **Events** + public Event portal at `/portal/events/:slug`.
- **Reports** landing at `/reports` + 11 routed reports (`daily-collection`, `fund-wise`, `daily-payments`, `cash-book`, `member-contribution`, `cheque-wise`, `fund-balance`, `returnable`, `outstanding-loans`, `pending-commitments`, `overdue-returns`).
- **Dashboards** landing at `/dashboards` + 4 inline dashboards built in the most recent batch:
  - `/dashboards/qh-portfolio` - status mix, repayment trend, top borrowers, upcoming installments, scheme/gold breakdown, avg loan size + tenure, overdue installments
  - `/dashboards/receivables` - aging buckets across commitments + returnables, cheque pipeline, upcoming maturities, oldest obligations, by-fund split, kind filter (All / Commitments / Returnables)
  - `/dashboards/member-engagement` - status, verification, gender, marital, age brackets, Hajj, Misaq, sector ranking, family-role ranking, new-member trend with window selector (6/12/24/36 months)
  - `/dashboards/compliance` - audit volume, error volume, top users + entities by audit, errors by severity + source, change-request status, period age, window selector (7/30/90/180/365 days)
  - Plus deep-links to existing dashboards: Operations (`/dashboard`), Treasury (`/accounting`), Reliability (`/admin/reliability`)
- **Accounting** at `/accounting`: KPIs, income/expense trend, asset composition.
- **Admin**: users, roles, master data (sectors, fund types, fund categories, fund subcategories, accounts, banks, expense types, transaction labels, lookups, agreement templates, currencies, exchange rates, numbering series), integrations, audit log, error logs, notification log, reliability dashboard, change-requests queue.

### 6.2 Latest commits (top of `main`)

```
22698a2 Dashboards round 2 - error states, filters, expanded coverage
d028e94 Dashboards module - landing + 4 BI dashboards
364d9a5 Family member invariants
4092587 Member profile Phase G + H - wealth declaration + 4 new roles
43c2434 Member profile Phase C - family read-only + self-edit verification queue
013574d Member profile Phase B - master-driven origin + multi-education
ab789aa Member profile Phase B2 - structured property details on address tab
beb43ea Member profile Phase A - clickable rows, age, gender, socials, Hajj/Umrah
5f68a7c E2E specs + planner for QH form v2 + guarantor consent uplift
ece1539 QH guarantor consent v2 - public portal flow with token-based remote ack
7db3603 QH form v2 - structured cashflow + gold + income, doc uploads, guarantor eligibility
```

### 6.3 Open / parked items

- `db/` and `test-results/` are local working artifacts. The `.bak` in `db/sql/jamaat.bak` should NOT be committed (27 MB binary). Recommend adding `db/` and `test-results/` to `.gitignore` on the next batch.
- Pre-existing TS errors in the frontend (recharts strict tooltip formatter type, a few unused imports) - `npm run build` runs `tsc -b` which fails on these. Vite dev server uses esbuild and ignores them, so dev works fine. Worth a cleanup pass eventually.
- Mobile app (Flutter) is scaffolded only - Phase 2.
- ITS integration is stubbed - real implementation when the spec lands.
- Bilingual content (Ar/Hi/Ur) - infrastructure done, content not filled.

---

## 7. Common dev commands

```powershell
# Run API tests
dotnet test

# Apply a new migration after editing entities
dotnet ef migrations add <Name> --project src/Jamaat.Infrastructure --startup-project src/Jamaat.Api
dotnet ef database update --project src/Jamaat.Infrastructure --startup-project src/Jamaat.Api

# Frontend
cd web\jamaat-web
npm run dev        # dev server at :5173
npm run build      # production build (will fail on pre-existing TS errors - not blocking dev)
npm run lint       # eslint

# Playwright E2E
cd tests
npx playwright test
```

---

## 8. Bringing a fresh Claude session up to speed on the new PC

Drop these as a single message at the start of the new session:

```
Continuing the Jamaat project at C:\Repos\Jamaat. Read docs/HANDOFF.md for context.

Two persistent rules across this project:
1. Always present recommendations + reasoning before asking me to choose between options.
2. Never use em-dash (-) or en-dash (-). Use plain hyphen (-) everywhere - prose, code, comments, commit messages, UI strings.

Current HEAD is 22698a2. The most recent batch shipped the dashboards module. We're at the end of that batch and ready for the next.
```

That re-establishes the rules without needing the auto-memory system on the new machine. If you want to migrate the memory files too, copy this folder across:

```
C:\Users\niyas\.claude\projects\c--Repos-Jamaat\memory\
```

It contains `MEMORY.md` + the per-rule markdown files (`feedback_no_em_dash.md`, `feedback_recommendations_first.md`, `project_jamaat_stack.md`).
