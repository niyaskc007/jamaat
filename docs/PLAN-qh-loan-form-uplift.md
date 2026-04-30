# QH new-loan form uplift

Started 2026-04-30.

User asked for three things on `/qarzan-hasana/new`:
1. Add inline documentation explaining the QH process + tooltips on every field
2. Add a free-text "purpose / repayment plan" box (and any related fields I think are missing)
3. Should guarantors also approve?

## Answering #3 first

**Yes, guarantors should acknowledge - and here's how I'm doing it:**

In real-world Qarzan Hasana practice (and broadly in Islamic surety/kafalah), a guarantor's consent is mandatory: an unwilling kafil is not legally or ethically a kafil. Two reasons it must be captured in the system:

1. **Audit trail** - if a borrower defaults and we ask a guarantor to step in, they could rightly say "I never agreed". Without recorded consent, we have no defence.
2. **Trust** - prevents borrowers from listing relatives speculatively without their knowledge.

There are two practical ways to do it:

| Option | How it works | Effort |
|---|---|---|
| **A) Operator-witnessed (v1)** | Borrower brings the guarantors to the counter; operator ticks a checkbox "Both guarantors are present and have agreed to act as kafil for this loan". Captures operator-as-witness + timestamp in the audit log. | Small |
| **B) Guarantor login / OTP (v2)** | Each guarantor receives a notification (SMS / email) with a one-tap "I accept" link. Guarantor's signed acknowledgment is stored separately. | Larger - needs a new public auth flow + signed link tokens |

**I'm building (A) now.** Most jamaats currently do this physically at the counter, so the operator witness mirrors the actual process. (B) is a clean follow-up when SMS/email rails are wired in. Both are additive - (B) doesn't invalidate (A).

I'll surface the acknowledgment as a **required** checkbox on the form. Submission to L1 approval will be blocked until it's ticked.

## What else I'm adding (gaps the user might have missed)

Looking at standard QH loan paperwork in our community:

- **Purpose of the loan** - free text. Required. The single most useful field for an approver.
- **Repayment plan** - free text. Required. "Where will the money come from."
- **Source of income** - free text. Optional but encouraged. Salary / business / rent / etc.
- **Other current obligations** - free text. Optional. Other loans/commitments outside this jamaat.

These all become part of the borrower-stated case the L1 approver sees on the decision-support panel. They don't change scoring or readiness logic; they're context.

## Phase A - Backend (~1 hr)

### Domain
Add to `QarzanHasanaLoan`:
- `Purpose` (string, max 2000) - required
- `RepaymentPlan` (string, max 2000) - required
- `SourceOfIncome` (string, max 1000) - optional
- `OtherObligations` (string, max 1000) - optional
- `GuarantorsAcknowledged` (bool) - default false; must be true to call `Submit()`
- `GuarantorsAcknowledgedAtUtc` (DateTimeOffset?) - timestamp when ticked
- `GuarantorsAcknowledgedByUserName` (string?) - the operator who witnessed

Update the constructor + `UpdateDraft()` to accept the new fields. Update `Submit()` to throw a `InvalidOperationException` if `GuarantorsAcknowledged == false` (with a clear message).

### DTOs
Update `CreateQarzanHasanaDto`, `UpdateQarzanHasanaDraftDto`, `QarzanHasanaLoanDto` to carry the new fields.

### Migration
`AddQhBorrowerFields` - 6 new columns on `QarzanHasanaLoan`.

### Service
`CreateDraftAsync` and `UpdateDraftAsync` accept and persist the new fields. `SubmitAsync` already calls `loan.Submit()` so the precondition fires automatically; surface a friendly error mapping.

## Phase B - Frontend new-loan form (~1.5 hr)

### Top-of-page documentation card
Below the page header, before the form. A collapsible (default open) info card with:
- **What is Qarzan Hasana** - 1-line summary
- **The process** - 4 steps: Draft -> L1 approval -> L2 approval -> Disbursement
- **Eligibility** - bullets (member in good standing, two guarantors, etc.)
- **Documents to bring** - bullets (cashflow doc, gold slip if applicable, ID)
- **Timeline expectation** - typical approval window

### Tooltips on every field
Use AntD's `Tooltip` wrapping a small `<InfoCircleOutlined>` icon next to each label. Examples:
- Borrower: "The member taking the loan. Must be in good standing."
- Scheme: "Standard / Education / Medical / Business / Marriage / Religious. Some schemes have specific eligibility."
- Amount requested: "Total amount you're requesting. The approver may approve a different amount."
- Instalments requested: "How many monthly payments you'd like to spread the repayment over. Max 240 (20 years)."
- Gold amount: "If pledging gold as security, enter its assessed value. Optional but strengthens the application."
- Guarantor 1/2: "Two guarantors are required. Each must be a member, and neither can currently be in default on another QH loan."
- Cashflow document: "Link to a document showing your monthly income and expenses. Strongly recommended for amounts over your usual range."
- Gold slip URL: "If pledging gold, link to the assessor's slip."

### New free-text fields
- **Purpose of the loan*** - 4 rows; required. Tooltip: "Describe what the funds will be used for. The clearer the purpose, the faster the approval."
- **Repayment plan*** - 4 rows; required. Tooltip: "How will you repay each instalment? Salary, business income, family support, etc."
- **Source of income** - 2 rows; optional. Tooltip: "Your primary income source. Helps the approver assess feasibility."
- **Other current obligations** - 2 rows; optional. Tooltip: "Any other active loans or major commitments outside this jamaat. Disclosing strengthens trust."

### Guarantor acknowledgment block
Visible only after both guarantors are picked. A bordered yellow notice with:
- A heading "Guarantor consent (required)"
- Explainer copy: "I confirm that both selected guarantors are present, understand they will act as kafil for this loan, and have agreed to back it. The approver may verify with each guarantor separately."
- A required checkbox: "I confirm guarantor consent"
- Disabled the "Create draft" button until the checkbox is ticked

### Validation
Client-side: required fields (purpose, repayment plan, acknowledgment) plus the existing requirements. Server-side: the same; Submit blocks if `GuarantorsAcknowledged == false`.

## Phase C - Detail page surface new fields (~30 min)

`QarzanHasanaDetailPage` - add a new "Borrower's case" section below the Loan details card showing:
- Purpose
- Repayment plan
- Source of income (if filled)
- Other obligations (if filled)
- Guarantor acknowledgment status (with witness name + timestamp)

This is what the approver reads to decide.

## Phase D - Tests + commit + push (~30 min)

- 1 new Playwright spec: open `/qarzan-hasana/new`, assert the documentation card + 4 new fields + ack checkbox render
- 1 spec extension on the QH detail spec to assert the borrower's-case section renders for any seeded loan that has the fields
- Build, restart API, run full suite, commit, push.

## Gaps / lapses being flagged

1. Pre-existing seeded loans will have `Purpose / RepaymentPlan` as empty strings (NOT NULL with default ''). The detail page will show "Not provided" for those rather than blank. New loans must fill them in.
2. The `GuarantorsAcknowledged` flag defaults to false on existing rows. For seeded data this is technically correct - they were created without the consent flow, so we don't lie about it. The Submit precondition only fires on new submissions.
3. **No new permissions**. Same `qh.create` permission gates the form.
4. Audit: every field change still flows through the existing AuditInterceptor. The `GuarantorsAcknowledged` toggle is captured automatically.

## Out of scope

- Notification-based guarantor approval (option B above) - separate feature.
- Borrower digital signature on the agreement - separate feature.
- Document upload UI for cashflow / gold slip (currently URL field only) - separate feature.

## Progress log
- 2026-04-30: Plan written. Beginning Phase A.
- 2026-04-30: Phase A complete. Added Purpose/RepaymentPlan/SourceOfIncome/OtherObligations + GuarantorsAcknowledged/AcknowledgedAtUtc/AcknowledgedByUserName to QarzanHasanaLoan. EF migration AddQhBorrowerFields applied. Submit() now throws if guarantor consent isn't recorded; UpdateDraft() clears the consent if either guarantor changes (so the new guarantor can't be silently committed to). Validator requires Purpose + RepaymentPlan on Create.
- 2026-04-30: Phase B complete. New-loan form rewritten with: collapsible documentation card (what is QH / eligibility / process / what to bring / timeline), tooltips on every field via the LabelWithHelp helper, four new free-text fields (Purpose required, Repayment plan required, Source of income optional, Other obligations optional) with character counters, and the operator-witnessed guarantor consent block (yellow alert + required checkbox). Submit gated on all of it; consent resets when a guarantor is changed.
- 2026-04-30: Phase C complete. QH detail page surfaces a new "Borrower's case" card showing all four free-text fields + the consent status tag (green when acknowledged, orange when pending). Card auto-hides when none of the fields are populated, so legacy loans stay clean.
- 2026-04-30: Phase D complete. 4 Playwright specs covering documentation card, free-text fields, submit-disabled gate, and detail page. Full suite: 19/20 passing, 1 skipped (no Active patronages in seed - by design).
