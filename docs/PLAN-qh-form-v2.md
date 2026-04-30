# QH form v2 - structured inputs, document uploads, guarantor eligibility

Started 2026-04-30.

User asked for four things:
1. Replace the cashflow URL field with structured cashflow data + an actual document upload (not a URL paste).
2. Same for gold - structured details + document upload.
3. Multi-select source-of-income that includes investment / share market / etc.
4. Check guarantor eligibility before the form is submitted, and give approvers visibility into each guarantor's track record.

## Phase A - Document upload infrastructure (~45 min)

Mirror the receipt agreement-document pattern exactly:
- New `IQarzanHasanaDocumentStorage` (in src/Jamaat.Application/QarzanHasana/) with the same shape as `IReceiptDocumentStorage`. Methods: StoreAsync, OpenAsync, DeleteAsync. Two **kinds** to support: `cashflow` and `goldSlip`.
- New `LocalFileSystemQarzanHasanaDocumentStorage` impl in Infrastructure. Files saved as `{loanId:N}-{kind}.{ext}` so both docs live alongside one another.
- New endpoints on `QarzanHasanaController`:
  - `POST /api/v1/qarzan-hasana/{id}/cashflow-document` - multipart, returns URL.
  - `GET /api/v1/qarzan-hasana/{id}/cashflow-document` - streams the file (for browser preview).
  - `DELETE /api/v1/qarzan-hasana/{id}/cashflow-document` - clears.
  - Same three for `gold-slip-document`.
- Permission: `qh.create` for upload + delete, `qh.view` for GET.
- Validation: PDF or image only, size cap of 10 MB (same as receipts).

## Phase B - Structured cashflow + gold + income (~1 hr)

### Domain
Add to `QarzanHasanaLoan`:
- **Cashflow (structured)**:
  - `MonthlyIncome` (decimal?) - sum of declared income sources
  - `MonthlyExpenses` (decimal?) - declared monthly outflows
  - `MonthlyExistingEmis` (decimal?) - other loans' monthly burdens
  - `MonthlyNetSurplus` is computed (Income - Expenses - EMIs); not stored
- **Gold (structured)** (only meaningful when GoldAmount is set):
  - `GoldWeightGrams` (decimal?)
  - `GoldPurityKarat` (int?) - 18 / 22 / 24 / etc.
  - `GoldHeldAt` (string max 200) - "Borrower's possession" / "ABC Jewellers vault" / etc.
- **Income sources**:
  - `IncomeSources` (string max 500) - comma-separated codes from a fixed enum (SALARY / BUSINESS / INVESTMENT / SHARE_MARKET / REAL_ESTATE / RENTAL / PENSION / FAMILY / AGRICULTURE / FREELANCE / OTHER)
  - Existing `SourceOfIncome` (free text) becomes the "details" field for elaborating on the selected sources.

The existing `CashflowDocumentUrl` and `GoldSlipDocumentUrl` fields stay - they now hold the document upload URL produced by Phase A's storage. The frontend stops asking the user to type a URL; it asks them to upload a file.

### Validation
- If Gold amount > 0, weight + purity + held-at all required at submit (server-side).
- Income sources: at least one must be selected (server-side).
- Document upload is **optional** (the structured fields carry the data; the doc is supporting evidence).

### Migration
`AddQhStructuredFields` - 6 new columns.

## Phase C - Guarantor eligibility check (~1 hr)

### Backend
New service method on IQarzanHasanaService:

```csharp
Task<Result<GuarantorEligibilityDto>> CheckGuarantorEligibilityAsync(
    Guid memberId, Guid borrowerId, Guid? otherGuarantorId, Guid? excludeLoanId,
    CancellationToken ct = default);
```

Returns:
```csharp
public sealed record GuarantorEligibilityDto(
    Guid MemberId, string MemberName, string ItsNumber,
    bool Eligible,
    IReadOnlyList<EligibilityCheck> Checks);

public sealed record EligibilityCheck(
    string Key, string Label, bool Passed, string Detail);
```

### Eligibility rules (in order of cheapness, fail-fast)

| Key | Rule | Why |
|---|---|---|
| `member.not_self` | Not the borrower | Self-guarantee disallowed |
| `member.not_other` | Not the other guarantor | Two distinct kafil required |
| `member.exists` | Not soft-deleted | Basic data hygiene |
| `member.status_active` | Status == Active (not Inactive / Deceased / Suspended) | Only active members can vouch |
| `member.tenure` | Tenure >= 90 days | Short-tenure guarantors haven't demonstrated reliability themselves |
| `member.no_recent_default` | No own QH loan in Defaulted status in last 24mo | Carries the same rule we apply to borrowers |
| `member.guarantee_count` | Currently guaranteeing < 2 active loans (Active + Disbursed states, excluding `excludeLoanId`) | Caps systemic risk |
| `member.reliability` | Reliability grade is A/B/Unrated. Grade C/D blocks unless approver overrides at L1. | Soft block - the approver can still proceed; but the form warns the borrower upfront |

The eligibility result is **advisory at form-creation time**. The form blocks Submit if any **hard** check fails. Soft checks (reliability) raise a yellow warning but can proceed. Approver-level enforcement is a separate question and not changed here.

### Endpoint
```
GET /api/v1/qarzan-hasana/check-guarantor/{memberId}?borrowerId=X&otherGuarantorId=Y&excludeLoanId=Z
```
Permission: `qh.create`.

## Phase D - Guarantor track records on decision support (~30 min)

Extend `LoanDecisionSupportDto`:
```csharp
public sealed record LoanDecisionSupportDto(
    Guid LoanId,
    LoanReliabilitySummary Reliability,
    LoanCommitmentSummary Commitments,
    LoanDonationSummary Donations,
    LoanPastLoansSummary PastLoans,
    LoanFundPosition FundPosition,
    IReadOnlyList<GuarantorTrackRecord> Guarantors);   // NEW

public sealed record GuarantorTrackRecord(
    Guid MemberId, string ItsNumber, string FullName,
    string Grade, decimal? TotalScore,
    int ActiveGuaranteesCount,
    int PastLoansCount, int DefaultedCount,
    bool CurrentlyEligible, string? IneligibilityReason);
```

Computed in `DecisionSupportAsync` for both guarantors. Adds two reads (1 reliability profile + 1 count of active guarantees) per guarantor, both cheap.

## Phase E - Frontend new-loan form (~1.5 hr)

### Cashflow section (replaces the URL field)
- Three numeric inputs: Monthly income / Monthly expenses / Other monthly EMIs
- A computed read-only "Net surplus available" tile that updates as the user types
- A document upload area below: "Upload supporting cashflow document (optional)" - drag-drop or click. Uses an `Upload` component pointing at the new endpoint. The uploaded file's URL lands in `cashflowDocumentUrl`.

### Gold section (replaces the URL field, conditional on Gold amount > 0)
- Weight (g) / Purity (Karat select 18/22/24) / Held at (text)
- Document upload for the assessor's slip below.

### Income section
- Multi-select for income source categories (uses AntD Select mode="multiple"). Same fixed list shown above.
- Free-text "Income details" box (renamed from "Source of income" - this is the elaboration field).

### Guarantor eligibility inline
- When G1 is picked, fire `checkGuarantorEligibility(g1, borrower, g2)` immediately.
- Show inline status under the picker: green tick + "Eligible" OR red warning with bulleted reasons + soft-yellow warnings for borderline cases.
- Same for G2 (with g1 as `otherGuarantorId`).
- Submit blocked if either has a **hard** failure.
- Document upload only enabled after the loan is created (drafted) - because the upload endpoint needs the loan id. So in the new-loan flow, the user creates the draft first (uploads come on the detail page), OR we could chain the upload after create succeeds and before navigation. **Decision**: chain it. After the create succeeds, if the user staged a file, POST it to the new loan's upload endpoint, then navigate. Simpler UX.

## Phase F - Decision support + detail surface for new fields (~45 min)

### Detail page Borrower's case card
- Add the structured cashflow numbers: Monthly income / Expenses / EMIs / Net surplus
- Add the gold structured fields when present
- Show selected income sources as tags + the income details below

### Decision support panel
- New "Guarantor track records" section below the existing reliability card. One mini-row per guarantor showing: name + ITS, grade tag, active guarantees count, past loans (completed/defaulted), eligibility tag.

## Phase G - E2E + commit + push (~30 min)

- Spec: form renders new structured fields (cashflow/gold/income/upload areas).
- Spec: guarantor eligibility check fires on selection (mocked-light - just assert that picking a member triggers an inline eligibility row).
- Spec: detail page surfaces structured fields when populated.
- Spec: decision support has a "Guarantor track records" section.

## Gaps / lapses being flagged

1. **Income source enum is a fixed list**. If a jamaat needs a custom one, Other + free-text covers it for now. Adding it as proper master data is a separate feature.
2. **Document storage is local-filesystem**. For multi-tenant cloud deployment, switch the storage implementation - the abstraction is already factored. No code changes outside Infrastructure registration.
3. **Eligibility "soft" rules vs "hard" rules**. The reliability-grade rule is soft (warns but allows submit) because we don't want to lock out borrowers when their guarantor's reliability isn't perfect; the approver still decides. Hard rules (own default, deleted member, status not Active, exceeding 2 active guarantees) block submission.
4. **Audit trail** - all changes still flow through the AuditInterceptor. Document uploads write a Modified row on the loan when the URL field changes; the file blob itself is not in audit (the file is in storage, addressable by URL).
5. **No new permissions**. `qh.create` gates uploads; `qh.view` gates serving the file.
6. **The "must approver be allowed to override soft checks" question** is parked for now. Today, the approver sees the warnings on their decision-support panel and decides; no auto-deny.

## Out of scope

- Notification-based remote guarantor consent (still v3).
- Configurable per-tenant eligibility thresholds (the values above are hard-coded constants).
- Borrower's digital signature on the agreement.

## Progress log
- 2026-04-30: Plan written. Beginning Phase A.
- 2026-04-30: Phase A complete - IQarzanHasanaDocumentStorage abstraction + LocalFileSystem impl + 6 controller endpoints (POST/GET/DELETE per kind). Mirrors the receipts/agreement-document pattern; same multipart shape; PDF or image up to 10 MB.
- 2026-04-30: Phase B complete - 6 new domain columns (MonthlyIncome/Expenses/EMIs, GoldWeightGrams/PurityKarat/HeldAt, IncomeSources). Migration AddQhStructuredFields applied. Validators require IncomeSources non-empty + gold structured fields when GoldAmount > 0.
- 2026-04-30: Phase C complete - CheckGuarantorEligibilityAsync probes 8 rules (5 hard + 2 soft + 1 reliability soft). Endpoint at /api/v1/qarzan-hasana/check-guarantor/{memberId}.
- 2026-04-30: Phase D complete - LoanDecisionSupportDto.Guarantors carries per-kafil reliability + active-guarantee count + past loans + current eligibility. Computed in DecisionSupportAsync.
- 2026-04-30: Phase E complete - New-loan form rewritten with structured cashflow numeric fields + computed net surplus tile, multi-select income sources, structured gold fields (only when amount > 0), inline eligibility check on guarantor selection, deferred document upload chained after create. Submit gated on all hard validations + consent checkbox.
- 2026-04-30: Phase F complete - Detail page surfaces structured cashflow / gold / income tags + the per-guarantor track-records card on the decision-support panel.
- 2026-04-30: Phase H (NEW) complete - Remote guarantor consent. New entity QarzanHasanaGuarantorConsent (per-guarantor token + status + IP/UA on response). Auto-generated on draft create; regenerated when guarantor swapped. Public endpoints /api/v1/portal/qh-consent/{token} (GET/accept/decline) - no auth, token IS the credential. Public portal page at /portal/qh-consent/{token}. Submit() now accepts EITHER operator-witnessed OR all-guarantors-remote-accepted (both equally trustworthy). Detail page shows a panel with copyable links the operator shares via SMS/WhatsApp.
- 2026-04-30: Phase G complete - 3 new Playwright specs covering structured fields, eligibility endpoint, public portal 404. Full suite: 22/23 passing, 1 skipped (no Active patronages in seed - by design).
