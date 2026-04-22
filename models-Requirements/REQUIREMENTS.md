# Jamaat System — Requirements derived from `Jamaat System (1).xlsx`

_Source: `C:\Repos\Jamaat\models-Requirements\Jamaat System (1).xlsx`
Extracted 2026-04-21 via `_dump.ps1` → `_dump.txt` (see those files for the raw data)._

This document captures **deltas between the workbook and the system as built today**. The workbook defines 9 sheets: User Login (design placeholder), User Profile, Sabil Account, Wajebaat Account, Mutafariq Account, QH Account, Receipt, Payment, Lookups. It models a single sample family (Chawalwala — HOF + spouse + 3 children, all under `Family_ID = 40498894`, tenant `AJMAN`, Sector `HATEMI`, Sub-Sector `2nd Floor`).

---

## 1. Executive summary

What the workbook tells us, that we haven't fully implemented:

1. **The Member record is much wider** — 70+ fields grouped into identity, biological relationships, contact, community roles, nationality/origin, education, religious credentials, housing, sector hierarchy, verification status, and event-scan history. The current `Member` entity carries ~12 of these.
2. **A Sector → Sub-Sector hierarchy** is the operational backbone of a Jamaat and is wholly absent from the system today. Each level has a male **and** female "incharge" (leader).
3. **Community organisations** (Shababil, Tanzeem Committee, Zakereen, Hizb ul Watan, etc.) are a separate many-to-many dimension — a member belongs to multiple orgs with a specific role in each.
4. **Fund types split into distinct account shapes**:
   - _Sabil / Wajebaat / Mutafariq / Niyaz_ → **per-member enrollment records** ("accounts") with recurrence + sub-type + approver. These are **not** pledges; they're long-lived enrollments under which receipts are collected.
   - _Qarzan Hasana (QH)_ → a **loan application** with amount requested vs approved, installments, gold collateral, 2 guarantors, document attachments, and **two-level approval**. Fundamentally distinct from donations.
5. **A regional grouping (Jamiaat) sits above Jamaat** (AJMAN → Khaleej), suggesting multi-tenant readiness is not just for separate jamaats but also for a regional roll-up.
6. **Data & Photo verification** are explicit operational states with dates — verification is an audited step, not an implicit "is the member active" flag.
7. **Event-scan history** (Urs Mubarak, 19mi Raat, etc.) is already being captured at the member level today in the source ITS system — last event + last place. We need to persist and surface this.
8. **Hijri + Gregorian dual dates** are tracked for religious milestones (Nikah). Our schema currently stores only Gregorian.

Net effect: a meaningful sprint of data-model and UI work beyond the community-platform sprint we just finished.

---

## 2. Data model deltas — detailed

### 2.1 Member — fields to add

Current `Member` entity: `Id, TenantId, ItsNumber, FullName, FullNameArabic, FullNameHindi, FullNameUrdu, Phone, Email, Address, Status, FamilyId, FamilyRole, ExternalUserId, LastSyncedAtUtc, + audit`.

The workbook needs us to add:

| Group | Field | Notes |
|-------|-------|-------|
| Identity | `TanzeemFileNo` | Per-family file number (stable community registry) |
| Name composition | `FirstPrefix`, `PrefixYear`, `FirstName`, `FatherPrefix`, `FatherName`, `FatherSurname`, `HusbandPrefix`, `HusbandName`, `Surname` | Full_Name is derived/snapshotted |
| Biological links | `FatherItsNumber`, `MotherItsNumber`, `SpouseItsNumber` | References by ITS, not by local PK |
| Personal | `DateOfBirth` (Gregorian) + `Age` (computed), `Gender` (Male/Female), `MaritalStatus`, `BloodGroup` | Spreadsheet only has Age — but DOB is needed to compute it |
| Religious | `MisaqStatus` (Done/NotDone), `MisaqDate`, `DateOfNikah`, `DateOfNikahHijri`, `WarakatulTarkhisStatus` (Green/Red/NotObtained), `QuranSanad` (Marhala Ula etc.), `QadambosiSharaf` (bool), `RaudatTaheraZiyarat` (bool), `KarbalaZiyarat` (bool), `AsharaMubarakaCount` (int, years attended) | "Ashara Mubaraka" is a 10-day religious observance — count is how many years the member attended |
| Contact | `WhatsAppNo` (separate from Mobile), `AlternatePhone` | Already have Phone, Email |
| Community | `Title` (NKD, etc.), `Category`, `Idara` | Honorifics + community classifications |
| Origin | `Vatan`, `Nationality` | Native place + passport nationality |
| Jamaat hierarchy | `JamaatId` (current tenant), `JamiaatId` (regional grouping) | Jamiaat is a future concept; keep as denormalized text for now |
| Qualification | `Qualification` (Primary/Secondary/Graduate/Postgraduate/Doctorate/Other) | Single-valued enum |
| Languages (multi) | `LanguagesJson` or `LanguagesCsv` | Sample values: Lisaan-ud-Dawat, English, Arabic, Urdu |
| Skills (multi) | `HunarsJson` or `HunarsCsv` | Free-text tags: Cricket, Cooking, IT, etc. |
| Work | `Occupation`, `SubOccupation`, `SubOccupation2` | 3-level hierarchy (e.g., Service → IT → IT Manager) |
| Housing | `HousingOwnership` (Ownership/Rented/Company-provided), `TypeOfHouse` (Flat/Villa/Apartment/Other) | |
| Address (structured) | `Building`, `Street`, `Area`, `City`, `State`, `Pincode` | Replace the single `Address` field with a structured address; keep a computed `AddressLineFull` for display |
| Sector / Sub-sector | `SectorId` (FK), `SubSectorId` (FK) | See §2.3 |
| Verification | `DataVerificationStatus` (Pending/Verified/Rejected), `DataVerifiedAtUtc`, `DataVerifiedByUserId`, `PhotoVerificationStatus`, `PhotoVerifiedAtUtc`, `PhotoVerifiedByUserId`, `PhotoUrl` | Distinct from Active/Inactive |
| Event-scan snapshot | `LastScannedEventId`, `LastScannedPlace`, `LastScannedAtUtc` | See §2.7 |
| Inactive | `InactiveStatus` (Active/Inactive/Deceased/Migrated/Suspended — currently `Status` with 4 values) + `InactiveReason` | Extend existing enum |

**HOF/FM type** — the workbook represents `HOF_FM_TYPE ∈ {HOF, FM}` per person. In our model this is already captured by `Member.FamilyRole=Head` vs anything else on the `Family.HeadMemberId`. No new column needed; just keep the semantic.

### 2.2 Family — fields to add

Current `Family` entity: `Id, Code, FamilyName, HeadMemberId, HeadItsNumber, ContactPhone, ContactEmail, Address, Notes, IsActive`.

Additions:

| Field | Notes |
|-------|-------|
| `TanzeemFileNo` | Primary identifier in the spreadsheet (`147` for the sample family). Should be unique per tenant. Use alongside the auto-generated `Code`. |
| `FamilyItsNumber` | In the workbook, `Family_ID = HOF_ID = 40498894`. Keeping both allows a stable family ref without depending on the volatile `HeadMemberId`. |
| `TotalMembers` (computed) | Already have via `memberCount` in the list DTO |

Family address fields in the workbook are identical to the HOF's — the HOF's structured address becomes the family address when not overridden. No new schema needed.

### 2.3 Sector + SubSector — new entities

The Jamaat is geographically split into Sectors, which are split into Sub-Sectors. Every member lives in exactly one (Sector, Sub-Sector). Each has a male **and** a female incharge. This is absent today.

```
Sector (TenantScoped, Auditable)
  Id, TenantId
  Code                    e.g., HATEMI
  Name                    e.g., "Hatemi Sector"
  IsActive
  MaleInchargeMemberId    FK Member
  FemaleInchargeMemberId  FK Member
  Notes
  + audit

SubSector (TenantScoped, Auditable)
  Id, TenantId, SectorId (FK)
  Code
  Name                    e.g., "2nd Floor"
  IsActive
  MaleInchargeMemberId    FK Member
  FemaleInchargeMemberId  FK Member
  Notes
  + audit
```

Unique index: `(TenantId, Code)` on Sector; `(TenantId, SectorId, Code)` on SubSector.

### 2.4 Organisation + MemberOrganisationMembership — new entities

Members belong to multiple community organisations (Shababil Eidz-Zahabi, Tanzeem Committee, Zakereen, Alaqeeq, Hizb ul Watan, Bunayyaat ul Eid iz Zahabi, Nazafat / Environment Committee, etc.) with a role per org (Member, Treasurer, Maliyah_Member, R, etc.).

```
Organisation (TenantScoped, Auditable)
  Id, TenantId
  Code
  Name, NameArabic
  Category                e.g., "Committee", "Idara", "Youth Group"
  IsActive
  Notes
  + audit

MemberOrganisationMembership (TenantScoped, Auditable)
  Id, TenantId
  MemberId (FK)
  OrganisationId (FK)
  Role                    free-text or enum per-org
  StartDate, EndDate?
  IsActive
  + audit
```

Migrate the existing `Organisation_CSV` text into structured rows on import.

### 2.5 Fund accounts — two distinct shapes

#### 2.5.1 FundEnrollment (for Sabil, Wajebaat, Mutafariq, Niyaz)

Per-member enrollment under a fund type. Long-lived, with sub-type and approval. Donations collected under this enrollment become Receipt lines with `fundEnrollmentId` set.

```
FundEnrollment (TenantScoped, Auditable)
  Id, TenantId
  MemberId (FK)
  FundTypeId (FK)
  Code                      e.g., AJM_01 (tenant-prefixed)
  SubType                   Sabil: Individual/Professional/Establishment
                            Wajebaat: Local/International
                            Mutafariq: (none / free)
                            Niyaz: Local/International/LQ
  RecurrenceType            Monthly | Quarterly | HalfYearly | Yearly | OneTime
  StartDate, EndDate?
  Status                    Draft | Active | Paused | Cancelled | Expired
  ApprovedByUserId, ApprovedAtUtc
  Notes
  + audit

Indexes: (TenantId, MemberId, FundTypeId) unique where Active
```

This is **simpler than a Commitment** — no total amount, no installment schedule. It's effectively "this member participates in Sabil yearly as Professional, enrolled since 2024, approved by Shaikh X".

> **Design call**: keep `Commitment` (for fixed pledges with schedules) and add `FundEnrollment` (for open-ended fund participation) as two separate entities. They're conceptually different — pledge vs. subscription. Trying to merge them bloats `Commitment`.

#### 2.5.2 QarzanHasanaLoan (for QH)

Interest-free loan application with approval workflow and collateral. Distinct from both Commitment and FundEnrollment.

```
QarzanHasanaLoan (TenantScoped, Auditable, AggregateRoot)
  Id, TenantId
  Code                           e.g., QH-2026-00001
  MemberId (FK)                  borrower
  FamilyId? (FK)                 optional family context
  Scheme                         MohammadiScheme | HussainScheme | Other
  AmountRequested
  AmountApproved
  Currency                       default tenant base
  InstalmentsRequested
  InstalmentsApproved
  StartDate, EndDate?
  Status                         Draft | PendingL1 | PendingL2 | Approved
                                 | Disbursed | Active | Completed
                                 | Defaulted | Cancelled | Rejected
  GoldAmount?                    decimal, for gold-backed loans
  Guarantor1MemberId (FK Member) required
  Guarantor2MemberId (FK Member) required
  CashflowDocumentUrl?
  GoldSlipDocumentUrl?
  Level1ApproverUserId, Level1ApprovedAtUtc, Level1Comments
  Level2ApproverUserId, Level2ApprovedAtUtc, Level2Comments
  RejectionReason?
  + audit

QarzanHasanaInstallment (owned by Loan)
  Id, LoanId
  InstallmentNo, DueDate
  ScheduledAmount
  PaidAmount, LastPaymentDate
  Status                         Pending | PartiallyPaid | Paid | Overdue | Waived
```

Approval pipeline: submitted → L1 approves (sets `AmountApproved`, `InstallmentsApproved`) → L2 approves → disbursed (produces a Voucher). Repayments flow in as Receipts with `qarzanHasanaLoanId` + `qarzanHasanaInstallmentId` on the receipt line.

> **Note** — the current `Commitment.PartyType=Member` with `FundType=Qarzan Hasana` is **not** a loan; it's a pledge. We should block creating a Commitment against a fund type flagged as a loan fund (or split the fund-type taxonomy).

### 2.6 Receipt — fields to add

Current `ReceiptLine` references `CommitmentId?` + `CommitmentInstallmentId?`. We need to generalize:

```
ReceiptLine
  + FundEnrollmentId?               FK FundEnrollment (for Sabil/Wajebaat/Mut/Niyaz collections)
  + QarzanHasanaLoanId?             FK QH loan (for repayment)
  + QarzanHasanaInstallmentId?      FK installment
```

Receipt DTO needs an `accountType` and `accountName` display for each line (Receipt sheet columns `Account Type` + `Account Name List`).

### 2.7 Event + EventScan — new (phase-2 scope)

Event attendance is tracked by scanning ITS at events. Last-scanned data is snapshotted on the Member.

```
Event (TenantScoped)
  Id, TenantId
  Name                e.g., "Urs Mubarak, 47th al-Dai al-Mutlaq..."
  Category            Urs | Miladi | Shahadat | Night | Ashara | Other
  Date, HijriDate
  Place
  IsActive

EventScan
  Id, EventId, MemberId
  ScannedAtUtc, ScannedByUserId
  Location (text or lat/long)
```

On scan, update `Member.LastScannedEventId + Place + AtUtc`. This is useful for attendance reports.

### 2.8 Other additions

- **Verification workflow** — add `data-verifier` and `photo-verifier` permissions. Add endpoints: `POST /members/{id}/verify-data`, `POST /members/{id}/verify-photo`.
- **Multi-level approval infrastructure** — already present in Voucher (single approval). Extend to support 2-level (or N-level) approval chains configurable per expense/fund type. QH specifically needs 2 levels.
- **Hijri date support** — add a lightweight Hijri formatter in both backend (QuestPDF output) and frontend (display pair: "30-Mar-2010 · 15 Rabiul Akhar 1431H.").

---

## 3. Lookups to seed

From the `Lookups` sheet:

| Lookup | Values |
|--------|--------|
| `PaymentType` (Receipt) | Bank, Cash |
| `SabilType` | Individual, Professional, Establishment |
| `WajebaatType` | Local, International |
| `QarzanHasanaScheme` | Mohammadi Scheme, Hussain Scheme |
| `NiyazType` | Local, International, LQ |
| `MutafariqType` | (none; free-text) |
| `VoucherType` | Sabeel (Professional/Individual/Establishment), Wajebaat (Local/International), Qarzan Hasana (Mohammadi/Hussain), Niyaz (Local/International/LQ), Mutafariq |

These should be seeded as rows under a new `cfg.Lookup` table or as enums per fund-type — my recommendation is a single `cfg.Lookup(Category, Code, Name, SortOrder)` table so new sub-types can be added without schema changes.

---

## 4. Member Profile UI — new requirements

Today: simple add/edit form with ITS + name + phone/email + status.

Must become a **multi-tab profile view** matching the workbook structure:

1. **Identity** — ITS, Tanzeem File, names (all name parts), Date of Birth, Gender, Blood Group, Marital Status, Misaq, Warakatul Tarkhis
2. **Family** — Family membership, biological links (father/mother/spouse ITS lookup), Nikah dates (Gregorian + Hijri)
3. **Contact** — Mobile, WhatsApp, Email, structured address
4. **Jamaat & Sector** — Jamaat, Jamiaat, Sector, Sub-Sector (with incharge shown read-only), Organisations list (editable multi-row)
5. **Origin & Education** — Vatan, Nationality, Qualification, Languages, Hunars
6. **Work** — Occupation + 2 sub-levels
7. **Religious credentials** — Quran Sanad, Qadambosi, Ziyarats, Ashara Mubaraka count
8. **Housing** — Ownership, type, full structured address
9. **Verification** — Data verification, Photo verification, upload photo, verification log
10. **Activity** — Last scanned event, attendance history, contributions summary, open commitments/loans

Each tab has its own form slice, persisted independently (no "save everything" button — more resilient and better for partial edits). ITS sync writes the fields it knows; local edits take precedence when marked as verified.

---

## 5. Sector & Admin UI — new screens

- **Sectors** master-data panel (list, add/edit, assign incharges by member picker).
- **Sub-sectors** nested under Sectors.
- **Organisations** master-data panel (list, add/edit category).
- **Member's organisations** — inline editor on the Member Profile's "Jamaat & Sector" tab.

---

## 6. Screens — fund accounts

Four fund-account-specific list + detail screens (one per fund type). All share a common layout but show sub-type-specific fields:

- `/fund-accounts/sabil` — list of Sabil enrollments + filters (sub-type, status, recurrence)
- `/fund-accounts/wajebaat`
- `/fund-accounts/mutafariq`
- `/fund-accounts/niyaz`
- `/qarzan-hasana` — distinct screen for loans (list, detail with installment schedule, L1/L2 approvals, guarantors, documents, disburse action)

Member profile "Activity" tab links to that member's accounts across all five.

---

## 7. Receipt flow — updated

Receipt line picker UX:
1. Select fund type.
2. System looks up the member's **active accounts** for that fund type:
   - If FundEnrollment exists → auto-link the line to it (display "Against Sabil (Professional) AJM_01").
   - If open Commitments exist for this fund + currency → offer the installment picker (already built).
   - If QH loan in Active state → offer "QH repayment" with installment picker.
3. The line stores whichever link applies.

On the Receipt list + detail, each line's badge shows _what it was paid against_.

---

## 8. Prioritized implementation plan

### Phase 1 — foundational, unblocks data import (2-3 sprints)

1. **Sector + SubSector** entities + master-data UI + Member.SectorId/SubSectorId (required before member import).
2. **Organisation + MemberOrganisationMembership** entities + UI.
3. **Member profile expansion**: all the new fields (§2.1) in schema + multi-tab profile UI. This is the biggest single item.
4. **Structured address fields** — migrate the free-text `Address` to `Building/Street/Area/City/State/Pincode` + computed display.
5. **Verification workflow** — `data.verify` + `photo.verify` permissions, endpoints, UI controls.
6. **Lookups table** + seed all sub-types from §3.
7. **Family + TanzeemFileNo** — add to schema, make TanzeemFileNo searchable, show prominently.

### Phase 2 — fund accounts refactor (2 sprints)

8. **FundEnrollment** entity + service + UI for Sabil/Wajebaat/Mutafariq/Niyaz.
9. **Refactor ReceiptLine** to reference FundEnrollmentId alongside existing commitment link.
10. **QarzanHasanaLoan** entity + 2-level approval workflow + guarantors + document uploads + UI.
11. **Voucher Type taxonomy** expansion per §3.

### Phase 3 — engagement & analytics (1-2 sprints)

12. **Event + EventScan** entities.
13. **Member activity tab** — contributions history, events attended, open accounts/loans.
14. **Sector / Sub-sector dashboards** — collections by sector, verification coverage, org membership stats.
15. **Hijri date pair formatting** across PDFs + UI.

### Phase 4 — multi-jamaat (when needed)

16. **Jamiaat** grouping above Tenant; cross-tenant reporting dashboard.
17. **Regional incharge** role with read-only cross-tenant access.

---

## 9. Open questions

Ambiguities that need confirmation before coding:

1. **Does the Member record come via ITS sync, or is it manually entered in our system?** The spreadsheet looks like an ITS export — if that's the system of record, we _store_ these fields but _ITS owns them_ and our UI becomes read-mostly with local overrides + verification. If we enter locally, the UI must be fully editable.
2. **Age vs Date of Birth** — the sheet only shows Age. We need DOB to compute Age; is DOB available from ITS? Or do we store Age as entered and recompute nothing?
3. **QH fund type distinctness** — should "Qarzan Hasana" be removed from the Commitment-compatible FundType list to prevent creating a pledge against a loan fund?
4. **Guarantor requirements** — must guarantors be active members of the same jamaat? Same sector? Any KYC rules?
5. **Jamiaat** — is this a real phase-2 need or aspirational? If real, we should reserve a `JamiaatId` column on Tenant now.
6. **Last_Scanned_Event** — is that data we capture via our own event-scanning app (to build), or does ITS hand us the last scan on each member sync?
7. **Photo storage** — where do photos live? On-prem blob, Azure blob, SharePoint, base64 in-DB? Affects the verification endpoint contract.
8. **Tanzeem File No.** — is this assigned by the Jamaat admin, or comes from ITS? Unique per family, yes — but per tenant or globally?
9. **FundEnrollment vs implicit enrollment** — if a member hasn't enrolled in Sabil but pays Sabil, does the receipt still post? (System could either auto-create an enrollment or reject.)

---

## 10. What _doesn't_ need to change

- Core auth, JWT, refresh tokens, permissions framework — unchanged, we just add permissions.
- Double-entry posting engine, ledger, periods, currencies, FX — unchanged.
- Receipt/Voucher numbering + PDF pipeline — unchanged (template text will expand).
- Tenant isolation — unchanged; we'll continue to scope every new entity to `TenantId` via the same global query filter.
- Existing Commitment / CommitmentAgreementTemplate stack — unchanged; Commitment remains the "fixed-amount pledge with schedule" concept. FundEnrollment is a different concept that lives beside it.
