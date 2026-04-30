# Detail page UX uplift plan

Started 2026-04-30. Owner: assistant.

User asked for four uplifts:
1. Patronage (`/fund-enrollments/:id`) - no detail page exists; build one with payment history, totals, Collect action, receipt drill-in.
2. QH detail (`/qarzan-hasana/:id`) - has a "huge whitespace" issue when not in approval state; rearrange + add insights.
3. QH detail UX refresh to match the "good UX" of CommitmentDetailPage.
4. Vouchers list (`/vouchers`) + detail - upgrade UX, add insights to list, richer detail page.

The reference pattern: **CommitmentDetailPage**. What makes it good:
- PageHeader with back + status-conditional actions
- Two-column main grid: rich details card + ProgressCard widget (health pill + circular chart + ribbon)
- Schedule/installments table with inline actions
- Drill-down panels stacked below
- Action modals, not native confirm
- Status-aware conditional rendering

We apply this pattern across the three target pages.

---

## Phase A - Patronage detail page (~2 hr)

New route: `/fund-enrollments/:id`

### Backend
- Add `GET /api/v1/fund-enrollments/{id}/receipts` returning all receipts linked to the patronage (by `ReceiptLine.FundEnrollmentId` direct match OR by member+fund match on confirmed receipts as fallback). Returns minimal projection (id, number, date, amount, status, paymentMode, currency).
- Reuse existing `GetAsync(id)` for the patronage record itself.

### Frontend
New `PatronageDetailPage`:
- **PageHeader** with back button. Right-side actions: Collect (status Active/Paused), Pause/Resume (toggle), Cancel (status not Cancelled/Expired). Permission-gated.
- **KPI strip** (4 tiles):
  - Total collected (sum across receipts, with currency)
  - Receipt count
  - Last payment date + days-since
  - Active duration (days since approval)
- **Two-column grid**:
  - Left: Details card (Code, Member, Fund, Sub-type, Recurrence, Status, Start/End dates, Notes, ApprovedBy/At)
  - Right: **Collection trend** small line chart (last 12 months from receipts) + a glance widget
- **Payment history table**:
  - Columns: Receipt#, Date, Amount, Mode, Status, Action (View)
  - Pagination, filter, click-row navigates to receipt detail
- **Status-aware empty state** - "No payments collected yet" + Collect CTA if Active.
- Cancel modal with reason (existing pattern).

Permissions: `enrollment.view` to see, `receipt.create` to Collect, `enrollment.approve` for status transitions.

Audit: all transitions already flow through `FundEnrollmentService`, which is captured by AuditInterceptor.

---

## Phase B - QH detail page UX refresh (~1.5 hr)

The whitespace bug is real: the current grid is `Col 16 / Col 8`, where the right-Col only has a small progress dashboard + two doc links when not in approval state. The fix:

### Layout overhaul (post-uplift)
- **PageHeader** with back + status-conditional actions (unchanged).
- **Status alerts** (Reject/Cancel) - keep.
- **NEW: KPI strip** (5 tiles): Requested / Approved / Disbursed / Repaid / Outstanding.
- **Status-aware main grid**:
  - When status is PendingL1 / PendingL2 / Approved (decision time): render `LoanDecisionSupport` full-width below the KPI strip. The current right-column panel becomes a top-level row, taking the whole content width, so approvers see the whole picture without scroll cramping.
  - When status is Disbursed/Active/Completed/Defaulted: render a **two-row main panel**:
    - Row 1: Details (left, 16) + Repayment progress card (right, 8) - same 2-col but the Details card is now leaner so it doesn't stretch past the progress widget.
    - Row 2: New **Repayment trend chart** (line chart of cumulative paid amount over time + scheduled), full width. This is the panel that fills the previous whitespace.
- **Installments table** (unchanged, kept at the bottom).
- All existing modals untouched.

### Implementation specifics
- Trim the Descriptions card. Move loan amounts (Requested/Approved/Disbursed/Repaid/Outstanding) to the new KPI strip; the Descriptions card keeps borrower / scheme / dates / guarantors / comments only.
- Repayment trend computed client-side from the installments array - x-axis is each due date, two series (scheduled cumulative, paid cumulative). No backend change needed.

Permissions, audit: unchanged.

---

## Phase C - Vouchers UX upgrade (~2 hr)

### Vouchers list
- **NEW: KPI strip** at the top:
  - Paid this month (amount + count)
  - Pending approvals (count, deep-link to filter)
  - Drafts (count, deep-link)
  - Total this year
- Backend: a thin `GET /api/v1/vouchers/summary` endpoint returning these counts. Reuse `db.Vouchers` queries.
- Existing table layout unchanged - filters / columns are already fine.

### Voucher detail
- **PageHeader** stays. Back button.
- **NEW: Header KPI strip** (4 tiles): Voucher #, Amount, Status, Paid On (or "Not yet paid").
- **Two-column main**:
  - Left: Details card (date, payee with ITS link, purpose, mode/cheque details, bank, remarks, FX note when multi-currency).
  - Right: **Approval timeline widget** - vertical list with timestamps for Created / Approved / Paid / Cancelled / Reversed. Reuses existing `CreatedAtUtc / ApprovedAtUtc / PaidAtUtc / CancelledAtUtc / ReversedAtUtc` if present on the DTO; if not, expose them.
- **Lines table** (unchanged, but visually cleaner).
- **NEW: Ledger impact panel** - shows the GL postings made when the voucher was paid (Dr/Cr, account, amount). Pull from `LedgerEntry` filtered by `SourceType=Voucher, SourceId=this.id`. Reuses existing ledger entries endpoint.
- Action bar at bottom: Approve & Pay / Cancel / Reverse (status-conditional, current behaviour).

Backend additions:
- `GET /api/v1/vouchers/summary` (status counts + month/year totals)
- Reuse the existing `GET /api/v1/ledger/entries?sourceType=Voucher&sourceId={id}` endpoint - no new code.

Permissions: voucher.view, voucher.approve, voucher.cancel, voucher.reverse - all existing.

Audit: unchanged.

---

## Phase D - E2E + commit + push (~30 min)

- 3 new specs:
  - `patronage-detail.spec.ts` - navigate to a patronage, assert KPI strip + history table render
  - `qh-detail.spec.ts` - assert KPI strip + repayment trend chart + decision support (when in approval state) all render
  - `voucher-detail.spec.ts` - list summary tiles render, detail KPI strip + approval timeline + ledger impact render
- Run full suite, fix any flakes, commit per phase, push.

---

## Gaps / lapses being flagged

1. **Receipt to Patronage link** - I rely on `ReceiptLine.FundEnrollmentId` being populated on real receipts going forward (Phase 1 wired this). Older receipts created before that fix may not have the FK; for those I fall back to `member + fund` match.
2. **QH repayment trend** - computed client-side from the installment array; if a partial payment hits the same installment on multiple dates, it shows as a single jump on `LastPaymentDate`. Good enough; truer "by-payment-date" view would require joining receipt lines.
3. **Voucher ledger impact panel** - relies on `LedgerEntry.SourceType=Voucher, SourceId=voucher.id` being consistently set. Confirmed from earlier work (`PostVoucherPaidAsync` writes this).
4. **Voucher summary endpoint** - I'm avoiding inflating IDashboardService for what is really a vouchers-page concern. Adding a `vouchers/summary` keeps concerns separated.
5. **No new permissions needed** - all actions reuse existing gates. No seed changes.

## Out of scope
- Editing voucher line items in the new detail page (existing behaviour preserved).
- Patronage editing UI (only view + status transitions in this pass).
- Bulk operations from patronage detail.

## Progress log
- 2026-04-30: Plan written. Beginning Phase A.
- 2026-04-30: Phase A complete - PatronageDetailPage at /fund-enrollments/:id with 4-tile KPI strip (total collected / receipts / last payment / active for), 12-month collection trend, payment history table, status-aware actions. Backend ListReceiptsAsync handles direct FK + member+fund fallback for legacy receipts.
- 2026-04-30: Phase B complete - QH detail rebuilt with 5-tile money KPI strip (Requested/Approved/Disbursed/Repaid/Outstanding), full-width LoanDecisionSupport in approval states (no more whitespace), 2-col details + repayment progress in active states, full-width cumulative repayment trajectory line chart. Details card slimmed to remove duplicate money fields.
- 2026-04-30: Phase C complete - Vouchers list got a 4-tile summary KPI strip (paid this month / pending approvals / drafts / paid YTD); pending and drafts deep-link to filtered status. Voucher detail rebuilt with header KPI strip, approval timeline widget on the right, ledger-impact panel showing GL postings (Dr/Cr by account) for paid/reversed vouchers. Backend added /vouchers/summary endpoint and a SourceId filter on the ledger entries query.
- 2026-04-30: Phase D complete - 4 new Playwright specs covering patronage detail / QH detail / vouchers list summary / voucher detail. Full suite 15/16 passing (1 skipped for missing seed data, by design).
