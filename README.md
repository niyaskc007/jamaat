# Jamaat — Donation, Receipt, Payment & Accounting System

Centralized Jamaat financial operations platform: digitizes receipt collection, payment vouchers, donation management, and internal accounting. Syncs members from the main Jamaat platform (ITS) and exposes APIs for external integration.

**Status:** M0 Foundations — solution skeleton, domain model, auth+audit scaffolding, React shell.

## Stack

| Layer | Choice |
|------|--------|
| Backend | ASP.NET Core 10 Web API, EF Core 10, Dapper (hybrid) |
| Database | MS SQL Server 2022 |
| Auth | ASP.NET Identity + JWT + refresh tokens |
| Logs | Serilog → Seq / File |
| PDF / Excel | QuestPDF Community / ClosedXML |
| Jobs | Hangfire (SQL) |
| Web | React 18 + Vite + TypeScript + Ant Design 5 + TanStack Query + react-hook-form + Zod + react-i18next |
| Mobile (Phase 2) | Flutter |

All libraries are free / OSS-licensed (no Syncfusion, DevExpress, Telerik, Duende).

Full architecture & delivery plan: `C:\Users\niyas\.claude\plans\shiny-toasting-cook.md`.

## Repository layout

```
Jamaat/
├── Jamaat.sln
├── Directory.Build.props          # global C# props (net10.0, analyzers, NuGet audit)
├── Directory.Packages.props       # central package management
├── global.json                    # pins .NET 10 SDK
├── src/
│   ├── Jamaat.Domain/             # entities, value objects, abstractions
│   ├── Jamaat.Application/        # services, DTOs, validators, mappers
│   ├── Jamaat.Infrastructure/     # EF DbContext, repos, Dapper, identity, audit
│   ├── Jamaat.Contracts/          # shared DTOs for clients
│   └── Jamaat.Api/                # controllers, middleware, Program.cs
├── web/jamaat-web/                # React + Vite web portal
├── mobile/                        # Flutter app (Phase 2)
├── tests/
│   ├── Jamaat.UnitTests/
│   └── Jamaat.IntegrationTests/   # Testcontainers MSSQL
├── db/                            # baseline SQL, seed scripts
└── deploy/docker/docker-compose.yml  # local MSSQL + Seq
```

## Local development

### Prerequisites

- .NET 10 SDK (`dotnet --version` → `10.0.x`)
- Node.js 20+ / npm 10+
- Docker Desktop (for local MSSQL + Seq)
- `dotnet tool install --global dotnet-ef --version 10.0.0`

### Start infrastructure

```sh
docker compose -f deploy/docker/docker-compose.yml up -d
```

MSSQL on `localhost:1433`, Seq log UI at http://localhost:5341.

### Apply migrations

```sh
dotnet ef database update --project src/Jamaat.Infrastructure --startup-project src/Jamaat.Api
```

### Run the API

```sh
dotnet run --project src/Jamaat.Api
```

OpenAPI spec at `https://localhost:5001/openapi/v1.json`. Health at `/health/live`.

### Run the web app

```sh
cd web/jamaat-web
npm install
npm run dev
```

Web portal at http://localhost:5173.

### Tests

```sh
dotnet test                                          # all
dotnet test tests/Jamaat.UnitTests                   # fast, no DB
dotnet test tests/Jamaat.IntegrationTests            # spins up MSSQL via Testcontainers
```

## Configuration

`src/Jamaat.Api/appsettings.json` — production defaults.
`src/Jamaat.Api/appsettings.Development.json` — dev overrides (Seq sink, verbose logging).

Critical secrets (JWT key, connection strings) must be set via environment variables or user-secrets in production. **Never commit real secrets.**

## Architectural principles

- **Clean architecture.** Domain has no external deps. Infrastructure depends on Domain and Application. Api composes everything.
- **Repository + Service pattern.** `IRepository<T>` for generic access; aggregate-specific repos for invariants.
- **Unit of Work.** Receipt confirmation + ledger posting commit in a single transaction.
- **Append-only financials.** LedgerEntry and AuditLog are never updated or deleted; reversals are new balancing rows.
- **Multi-tenant ready.** `TenantId` on every tenant-scoped table, EF global query filters, tenant resolution middleware. Single default tenant in Phase 1.
- **Audit-heavy.** EF `SaveChangesInterceptor` writes before/after JSON for every mutation with correlation ID, user, screen, IP, UA.
- **Errors as ProblemDetails (RFC 7807).** Every error returns a `traceId` the user can quote to support.
- **Bilingual-ready.** i18n and multi-language name columns in Phase 1; Ar/Hi/Ur content + RTL in Phase 2.

## Phase roadmap

- **Phase 1 (current):** Web-only portal — master data, members, receipts, vouchers, accounting, reports, audit.
- **Phase 2:** Flutter mobile app (offline-first, thermal printer, QR scan), bilingual UI/print (Ar/Hi/Ur + RTL), ITS SSO, advanced dashboards.
