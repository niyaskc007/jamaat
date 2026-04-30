# Dashboards + Reports module

Started 2026-05-01.

User asks for a Dashboards + Reports module: main nav entries, multiple dashboards, all relevant reports, both with landing pages.

## What's already in place

- `/dashboard` (singular) - Operations / home dashboard
- `/accounting` - Treasury KPIs + income/expense + asset composition
- `/admin/reliability` - admin reliability dashboard
- `/reports` - reports landing card-grid + 11 sub-routes

## What I'm building

**Phase 1 - Quick fix (done):** Role-in-family on member profile was showing the raw enum digit (5) instead of the label (Son). Fixed via FamilyRoleLabel lookup.

**Phase 2 - `/dashboards` landing page**
Card grid mirroring the /reports pattern. Groups:
- **Operations**: Operations (->`/dashboard`), Member engagement (NEW)
- **Financial**: Treasury (->`/accounting`), QH portfolio (NEW), Receivables aging (NEW)
- **Insight**: Reliability (->`/admin/reliability`), Compliance + audit (NEW)

The catalog includes existing dashboards (just deep-linking) PLUS new ones at `/dashboards/{slug}`.

**Phase 3 - 4 new dashboards**

1. **QH Portfolio** (`/dashboards/qh-portfolio`)
   - KPI tiles: total loans / total disbursed / total repaid / outstanding / default rate
   - Status distribution donut (Active / Disbursed / Completed / Defaulted / Pending approvals)
   - Repayment trend line (last 12 months: amount disbursed vs repaid)
   - Top 5 borrowers by outstanding + their reliability grade
   - Upcoming installments table (next 30 days)

2. **Receivables aging** (`/dashboards/receivables`)
   - 4 KPI tiles: pending commitments / overdue returnables / cheques in pipeline / overdue commitment installments
   - Aging buckets bar (current / 1-30 / 31-60 / 61-90 / 90+)
   - Returnables by maturity status (matured-outstanding / matured-fully-returned / not-matured)
   - Top 10 oldest open obligations

3. **Member engagement** (`/dashboards/member-engagement`)
   - KPI tiles: total members / active / inactive / new this month / verified%
   - New members per month (line, last 12 months)
   - Verification status pie (NotStarted / Pending / Verified / Rejected)
   - Status pie (Active / Inactive / Deceased / Suspended)
   - Reliability grade slice (deep-link to /admin/reliability)

4. **Compliance + audit** (`/dashboards/compliance`)
   - KPI tiles: audit events 30d / open errors / pending change requests / unposted vouchers / unverified members
   - Audit volume bar (last 30 days)
   - Error severity breakdown
   - Change-request status pie

**Phase 4 - Backend endpoints**
Four small endpoints under `/api/v1/dashboard/`:
- `qh-portfolio` - aggregates QH loans
- `receivables-aging` - commitments + returnables aging buckets
- `member-trend` - new-member counts by month + status breakdown
- `compliance` - audit/error/queue counts

**Phase 5 - Reports landing tweaks**
Already comprehensive (11 reports in 4 groups). Add:
- A "Quick stats" header row showing today's activity
- Better visual separation of groups

**Phase 6 - Sidebar wiring**
Add a "Dashboards" entry in the Accounting section (next to Reports). Both Reports and Dashboards live there as analytical tools.

**Phase 7 - E2E + commit + push**

## Defaults locked in

- Card-grid landing pattern - matches existing /reports.
- New dashboards live under `/dashboards/{slug}` route param (single page component switches by slug, like ReportsPage does).
- Permission gating: `reports.view` for /dashboards landing (same as existing dashboard insights). Some sub-dashboards may need their own gates (e.g., compliance needs `admin.audit`).
- No new master data; all dashboards aggregate from existing tables.
- Every backend aggregation is one-round-trip per dashboard - no fan-out of 4-5 calls.

## Out of scope

- Customisable dashboards (admin builds their own with widgets) - separate large feature
- Per-tenant dashboard config
- Dashboard PDF export

## Progress log
- 2026-05-01: Plan written. Quick fix done. Beginning Phase 2.
