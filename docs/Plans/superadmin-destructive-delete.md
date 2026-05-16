# SuperAdmin Destructive Delete — Implementation Plan

Status: **DRAFT — awaiting agreement on the 6 open questions in §11 before code starts.**

Owner: TBD
Tracking issue: TBD
Last revised: 2026-05-16

---

## 1. Purpose

Give a SuperAdmin a single, audited, recoverable way to delete master data, identity records (Members, Families, ApplicationUsers), and "delete" transactions (which, for accounting integrity, is implemented as **Reverse + retire the document**, not a physical row removal of posted ledger entries).

A delete must:

1. **Preview the blast radius** before doing anything — show every dependent record, classify each as block / cascade / redact, and let the SuperAdmin abort.
2. **Be reversible for 30 days** — soft-delete with a retention timer; row stays in the DB, hidden from default queries, restorable in one click.
3. **Leave a forever audit trail** — who deleted what, when, why; the AuditLog row is itself never purged.
4. **Never break the GL** — posted ledger entries are immutable; transaction "deletes" reverse via compensating entries dated today, then the original document is retired.

---

## 2. Out of scope (intentionally)

- Deleting tenants. SuperAdmin can deactivate a tenant, never destroy it atomically.
- Hard-deleting AuditLog, LoginAuditEntry, ErrorLog, NotificationLog rows. These are append-only forever (or a separate retention horizon ≥ 7 years to match accounting norms). When a Member is purged, their PII in these tables is **redacted in place**; the row stays.
- Bulk "delete everything from 2023" workflows. One target at a time. Bulk comes later if at all.
- Deleting posted JournalEntries / LedgerEntries directly. Those entries are immutable; the only way they leave the books is via a reversing entry. No exception.

---

## 3. Three categories, three policies

### 3a. Master data (low risk)

Tables: `Lookups`, `Sectors`, `SubSectors`, `Organisations`, `FundTypes`, `FundCategories`, `FundSubCategories`, `BankAccounts`, `ExpenseTypes`, `NumberingSeries`, `QhSchemes`, `CommitmentAgreementTemplates`, `CmsBlock`, `CmsPage`, `TransactionLabel`.

Policy: soft-delete + 30d retention + auto-purge. SuperAdmin can purge-now.

A delete is **blocked** if any active transaction still references the row (e.g. a FundType referenced by an open commitment). The impact preview lists the dependents and tells the SuperAdmin to retire them first.

### 3b. Identity (medium-high risk)

Tables: `Member`, `Family`, `ApplicationUser` (login), plus owned data (`MemberAsset`, `MemberEducation`, `MemberChangeRequest`, `PushSubscription`, `MemberOrganisationMembership`).

Policy: soft-delete + 30d retention + auto-purge, **with hard blockers**:

- Active commitment (`Status in {Active, Pending}`) → blocked. Cancel first.
- Open QH (`Status not in {Cancelled, Rejected, Settled}`) → blocked. Cancel/settle first.
- Open fund-enrollment (`Status in {Active, Pending}`) → blocked. Cancel first.
- Open guarantor consent against this member as guarantor → blocked. Decline / cancel parent loan first.

Cascading children (auto-cascade on soft-delete, auto-purge with the parent):
`MemberAsset`, `MemberEducation`, `MemberChangeRequest`, `PushSubscription`, `MemberOrganisationMembership`.

Redact-only at purge time:
`AuditLog`, `LoginAuditEntry`, `Receipt.MemberNameSnapshot`, `Receipt.ItsNumberSnapshot`, similar snapshot columns on `Commitment`, `QarzanHasanaLoan`, `EventRegistration`. These rows keep their other data; PII fields get rewritten to `<purged-yyyy-mm-dd>`.

If a Member also has an `ApplicationUser` linked (the login), both go together by default. Operator can opt to only revoke the login and keep the member record (separate button).

### 3c. Transactions (highest risk)

Tables: `Receipt`, `Voucher`, `PostDatedCheque`. `JournalEntry` and `LedgerEntry` are **never user-deletable**; they only leave the books via the system-generated reversing entry that the Receipt/Voucher reversal produces.

Policy: SuperAdmin "Delete" on a Receipt or Voucher is implemented as **Reverse + retire**:

1. Server posts a compensating reversal via the existing `IReceiptService.ReverseAsync` / `IVoucherService.ReverseAsync` path. Books balance from this moment forward.
2. The original document row is marked with `RetiredAtUtc`, hidden from default lists, but stays in the DB so the reversal trail is auditable.
3. After 30 days, the document row is purged. The reversing ledger entry stays forever.

A user-initiated "Delete" against a transaction that has *already* been reversed (or was a Draft, never posted) becomes a simple soft-delete.

**Two-person rule**: posted transactions require a second SuperAdmin's approval before the reversal is committed. Master data + identity don't.

---

## 4. Data model

### 4a. New columns on each soft-deletable table

```
DeletedAtUtc       datetimeoffset NULL
DeletedByUserId    uniqueidentifier NULL  -- FK to AspNetUsers
DeletionReason     nvarchar(500) NULL     -- REQUIRED at delete time
RetentionUntilUtc  datetimeoffset NULL    -- DeletedAtUtc + 30d, or NULL for indefinite
PurgedAtUtc        datetimeoffset NULL    -- set by the auto-purge job at hard-delete time
```

Index: `(TenantId, DeletedAtUtc) WHERE DeletedAtUtc IS NOT NULL` for the Trash list view.

### 4b. Global query filter

Extend the existing `ITenantScoped` filter to also exclude rows where `DeletedAtUtc IS NOT NULL`. Default queries see neither soft-deleted nor cross-tenant rows.

`IgnoreQueryFilters()` is reserved for the Trash list and the impact analyzer.

### 4c. Migration of existing `IsDeleted` columns

`Member`, `Family`, `Sector`, a few others already have a plain `IsDeleted bit`. Migration:

1. Add the new columns.
2. For each row where `IsDeleted = 1`, set `DeletedAtUtc = CreatedAtUtc` (or `1900-01-01` if unknown), `DeletedByUserId = NULL`, `DeletionReason = 'pre-2026 IsDeleted flag'`, `RetentionUntilUtc = NULL` (indefinite, won't auto-purge).
3. Application reads `DeletedAtUtc IS NOT NULL` going forward; the legacy `IsDeleted` column stays for one release as a read-only mirror, then dropped per RULES.md §34.

### 4d. AuditLog extensions

Existing `AuditLog` table already records who-did-what. Add:

```
Snapshot           nvarchar(max) NULL  -- JSON snapshot of the row at delete time
ImpactCount        int NULL            -- # of dependent rows the action affected
TargetType         nvarchar(80) NOT NULL  (already may exist; verify)
```

Every soft-delete / restore / purge / reverse writes one AuditLog row.

---

## 5. Permissions

New permission claims (added to `AllPermissions` + the SuperAdmin role):

```
admin.delete.master         # soft-delete master-data row
admin.delete.identity       # soft-delete a Member / Family / ApplicationUser
admin.delete.transaction    # initiate Reverse-and-retire on a Receipt / Voucher
admin.purge.now             # bypass 30d retention and hard-delete immediately
admin.restore               # restore a soft-deleted row before retention expires
admin.delete.approve        # second-approval for transaction reversals (two-person rule)
```

Wire each via the existing `PermissionPolicyProvider` (the dynamic `permission:<name>` -> `PermissionRequirement` pattern, no manual policy registration needed).

Only `SuperAdmin` role gets all six by default. `Administrator` gets none — they go through `member.update` / `receipt.reverse` etc. (existing paths).

---

## 6. API surface

```
GET    /api/v1/admin/delete-impact/{entity}/{id}    -- preview (no side effects)
POST   /api/v1/admin/soft-delete/{entity}/{id}      -- body: { reason }
POST   /api/v1/admin/restore/{entity}/{id}
POST   /api/v1/admin/purge/{entity}/{id}            -- bypass retention (admin.purge.now)

GET    /api/v1/admin/trash?entity=&page=&pageSize=  -- list everything in soft-delete limbo
GET    /api/v1/admin/trash/expiring?withinDays=7    -- weekly digest source

POST   /api/v1/admin/delete-transaction/{type}/{id} -- reverse-and-retire; body: { reason }
POST   /api/v1/admin/delete-transaction/{type}/{id}/approve  -- second approver
```

`{entity}` values map 1:1 to a static allowlist enum (`Member`, `Family`, `User`, `FundType`, `Sector`, etc.). The handler resolves the right service from a `Dictionary<string, IDeletionService>` keyed by entity name. No reflection, no string parsing into types.

All endpoints `[Authorize(Policy = "admin.delete.<scope>")]`.

---

## 7. Service layer

### 7a. `IDeletionImpactAnalyzer<TEntity>`

One implementation per deletable entity type. Returns:

```csharp
public sealed record DeletionImpact(
    EntityRef Target,                  // type + id + display label
    IReadOnlyList<DeletionBlocker> Blockers,    // hard stops; impact >0 = abort
    IReadOnlyList<DeletionCascade> Cascades,    // children that go with the parent
    IReadOnlyList<DeletionRedaction> Redactions,// rows that survive but lose PII
    IReadOnlyDictionary<string, int> Counts);   // {"commitments": 2, "qh": 0, ...} for the modal
```

Examples:

- `MemberDeletionImpactAnalyzer`:
  - Blockers: active commitments, open QH, open fund-enrollments, open guarantor consents.
  - Cascades: MemberAsset, MemberEducation, MemberChangeRequest, PushSubscription.
  - Redactions: AuditLog rows touching this MemberId, Receipt snapshot fields, etc.

- `FundTypeDeletionImpactAnalyzer`:
  - Blockers: any commitment/enrollment/receipt referencing this fund type (active or historical — for historical we may switch to "rename to <archived>" instead of delete).
  - Cascades: FundTypeCustomField rows owned by this fund type.

### 7b. `ISoftDeleteService<TEntity>`

```csharp
Task<Result> SoftDeleteAsync(Guid id, string reason, CancellationToken ct);
Task<Result> RestoreAsync(Guid id, CancellationToken ct);
Task<Result> PurgeAsync(Guid id, CancellationToken ct);  // bypasses retention
```

Each implementation:

1. Loads the entity (with `IgnoreQueryFilters` for restore/purge so soft-deleted rows are reachable).
2. Calls the impact analyzer; aborts with `Error.Business` listing blockers.
3. Sets `DeletedAtUtc = clock.UtcNow`, `DeletedByUserId = currentUser.UserId`, `DeletionReason = reason`, `RetentionUntilUtc = clock.UtcNow + TimeSpan.FromDays(30)`.
4. Cascades: same fields on each cascading child.
5. Writes an `AuditLog` entry with the JSON snapshot.

Restore: clears the four delete-marker columns on parent + cascading children. Refuses if `PurgedAtUtc IS NOT NULL`.

Purge: physically removes the parent + cascading children, and runs the redact pass on `AuditLog` etc. Sets `PurgedAtUtc` only on the AuditLog row (the entity itself is gone). Refuses if `DeletedAtUtc IS NULL` (you can't purge a live record).

### 7c. Transaction reversal — wraps existing services

`SuperAdminTransactionDeletionService.DeleteAsync(receiptId, reason, ct)`:

1. Loads the receipt. If `Status` in {`Cancelled`, `Reversed`, `Draft`} → falls through to a plain soft-delete.
2. Else: requires `admin.delete.approve` from a second user. If not provided yet, writes a pending `TransactionDeletionRequest` row and returns `Approval Required`.
3. On approval: calls `IReceiptService.ReverseAsync` with the reason. The existing flow posts the compensating ledger entry.
4. Sets `Receipt.RetiredAtUtc`. Same retention timer.
5. AuditLog row stamps both the requester and the approver.

`Voucher` mirrors this.

### 7d. Hangfire job — `PurgeExpiredSoftDeletesJob`

Runs daily at 03:00 UTC. For each tracked entity type:

```sql
SELECT Id FROM Member
WHERE DeletedAtUtc IS NOT NULL
  AND PurgedAtUtc IS NULL
  AND RetentionUntilUtc < SYSUTCDATETIME()
```

Calls `PurgeAsync` per id. Logs counts. Sends a SuperAdmin digest if anything was purged.

Job is paused (config flag `Jobs:AutoPurge:Enabled = false`) for the first release. SuperAdmin manually purges to build confidence; we flip the flag on after a clean week.

---

## 8. SPA pages

### 8a. Impact-preview modal

Component: `<DeletionImpactModal entity=... id=... onConfirm=...>`.

Fetches `GET /api/v1/admin/delete-impact/{entity}/{id}` on mount. Renders three sections:

- **Blockers** (red, if any) — list each, link to its detail page. Confirm button disabled while any blocker exists.
- **Will cascade** — counted summary, expandable list.
- **Will survive (redacted)** — counted summary; tooltip explains "audit logs keep the action history but anonymize this person's name/email/ITS".

Reason textarea (required, ≥ 10 chars). "Delete" button (red); shows a final confirm step.

### 8b. Trash list page

Route: `/admin/trash`.

Table: entity type | label | deleted at | deleted by | reason | retention deadline | actions (Restore / Purge now).

Filter: by entity type, by deleter, by "expiring within N days".

A row that's past `RetentionUntilUtc` shows a red "purged any moment" badge.

### 8c. Hooks into existing pages

- Members list / detail: SuperAdmin sees a "Delete member" button. Click → impact modal. Other roles don't see the button at all (gated by `admin.delete.identity`).
- Master-data pages (FundTypes, Sectors, Organisations, …): same pattern, gated by `admin.delete.master`.
- Receipt / Voucher detail: SuperAdmin sees "Delete receipt" → impact modal (which mostly says "this will post a reversal entry; books stay balanced") → requires second approval → AuditLog entry.

### 8d. SuperAdmin avatar dropdown

Add "Trash" entry, visible only when user holds any of the new `admin.delete.*` perms.

---

## 9. Migration strategy (per RULES.md §34)

Each table needs the four new columns. Additive migrations only:

- **Release N**: AddColumn on every soft-deletable table. App code reads from new columns; legacy `IsDeleted` bit is mirrored at write time.
- **Release N+1**: data backfill of legacy `IsDeleted=1` rows into `DeletedAtUtc = CreatedAtUtc, RetentionUntilUtc = NULL`. App code stops writing to legacy `IsDeleted`.
- **Release N+2**: DropColumn on legacy `IsDeleted`.

No rename-in-place. No column-type changes.

---

## 10. Test plan

Each delete path needs:

1. **Unit**: impact analyzer returns correct blockers / cascades for a synthetic graph.
2. **Integration** (against a real SQL Server): full delete → restore → re-delete → purge cycle. Verify `AuditLog` entries written at each step. Verify cascading children move with the parent.
3. **GL invariant** (for transaction deletes): trial balance at instant T = trial balance at instant T+ε after reversal. The number is allowed to differ between T-1 and T (the reversal adds a row); the invariant is balance integrity, not row-count constancy.
4. **Privacy**: after purge of a Member, no live API endpoint returns their name/email/ITS. AuditLog rows return `<purged>` placeholder.
5. **Smoke**: SuperAdmin token can hit the new endpoints; other operator tokens get 403.

The smoke-flows.mjs already-exists pattern is the right home for #5. #1-#4 land as xUnit / Testcontainers tests.

---

## 11. Open questions (need answers before code starts)

1. **User vs Member delete**: one button or two? Recommendation: two — "Revoke login" (keep member record) vs "Delete member" (orphans login then removes both).
2. **Active-dependency policy**: confirm hard-block over cascade-cancel-the-loan. (My recommendation: hard-block. Cascading a loan cancellation is destructive to guarantors.)
3. **Two-person rule scope**: confirm "transactions yes, master + identity no". Or also identity?
4. **Retention duration**: 30d default. Regulatory floor?
5. **AuditLog redaction-on-purge**: confirm acceptable. Standard GDPR posture; the audit row stays, PII fields are rewritten.
6. **Existing `IsDeleted` columns**: confirm the three-release additive migration plan in §9.

If we agree on the six, the first commit is **Phase 1 only** — master data + the foundations (data-model columns, perms, impact analyzer for one entity, soft-delete service, Trash page, Hangfire job in dry-run mode). One scoped batch, no identity, no transactions.

---

## 12. Estimate

- Phase 1 (master data + foundations): ~1 week
- Phase 2 (identity + transaction reversal): ~1 week
- Phase 3 (SPA polish, cross-tenant view, weekly digest): ~½ week

Plan to stop and review at each phase boundary.
