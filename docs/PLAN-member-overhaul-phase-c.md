# Member overhaul - Phase C

Started 2026-04-30. Continues from Phases A + B.

User's responses to the 3 questions:
- **A (item 12 - Family):** family info on member profile must be read-only. Family management lives only in `/families` (and the existing `FamilyDetailDrawer` UI, which already covers Head / Members table / family-tree visualisation). Member profile shows the data and links into the drawer.
- **B (self-edit):** members CAN edit anything, but their changes go to a verification queue. An admin / permissioned user reviews + approves / rejects. Direct admin edits bypass the queue.
- **C (wealth):** confirmed - `member.wealth.view` seeded to admins + QH approvers + counters/accountants only.

User also added:
- **D (roles):** add new roles (Data Editor / Validator etc.) and a tab to manage roles + permissions. The user mentioned "events" specifically - they want the admin to be able to manage role-permission mappings, including event-related permissions.

## Phase E - Family tab read-only (item A / #12, ~30 min)

The Family tab on the member profile loses its editable inputs. It becomes a display-only section:
- Family chip + "Open in family page" button (already exists; make it the primary call to action)
- Father / Mother / Spouse: show the linked member's name + ITS as read-only chips with click-through to that member
- Nikah date / Hijri date: read-only display, edit lives on the Personal tab (already does)

The existing Family detail drawer already covers what the user shared - Head info / Members table / family tree. It's launched from the profile via "Open family". I'll keep that flow and remove the editable form on the member profile.

Since Father / Mother / Spouse ITS are still editable elsewhere on the family page (they're attributes of family relationship), this just blocks the per-member shortcut. Edits go through the families page or a future family-page edit drawer.

## Phase F - Self-edit with verification queue (item B, ~3 hr)

This is the largest piece.

### Domain
New aggregate `MemberChangeRequest`:
- Id, TenantId, MemberId, Section (string: "Identity" / "Contact" / "Personal" / "Address" / "Origin" / "Education" / "Religious" / "FamilyRefs")
- PayloadJson - the proposed update DTO serialised
- Status enum (Pending / Approved / Rejected)
- RequestedByUserId / RequestedByUserName / RequestedAtUtc
- ReviewedByUserId / ReviewedByUserName / ReviewedAtUtc
- ReviewerNote (optional, required on reject)
- IAuditable + ITenantScoped

### Service
- `ISubmitChangeRequestService` (or method on existing IMemberProfileService) takes (memberId, section, payload, requesterUserId/Name) + saves a Pending row. No mutation to Member yet.
- `ApproveAsync(requestId)` - look up the request, deserialise, call the matching `Update<Section>Async` on `IMemberProfileService` to apply, then mark Approved.
- `RejectAsync(requestId, note)` - mark Rejected with note.
- `ListPendingAsync` - admin queue.
- `ListForMemberAsync(memberId)` - what the member can see about their own pending requests.

### Endpoints
Per-section submission:
```
POST /api/v1/me/profile/identity/request-update      (member.self.update)
POST /api/v1/me/profile/contact/request-update       (member.self.update)
... etc for personal, address, origin, education-work, religious
```

Queue:
```
GET  /api/v1/admin/member-change-requests?status=Pending     (member.changes.approve)
POST /api/v1/admin/member-change-requests/{id}/approve       (member.changes.approve)
POST /api/v1/admin/member-change-requests/{id}/reject        (member.changes.approve)
```

### Permissions
- `member.update` (existing) - direct edit, bypasses queue
- `member.self.update` (new) - submit change requests for own profile only
- `member.changes.approve` (new) - approve / reject queue. Seeded to Administrator + new "Data Validator" role

### Frontend
- When the logged-in user is editing their own profile AND they don't have `member.update` BUT they do have `member.self.update`: the SectionSaveBar submits to the request-update endpoint instead of the direct update. Toast says "Submitted for verification".
- New admin page `/admin/change-requests` showing the queue. Each row: member + section + requested-by + when. Click expands to show side-by-side diff (current vs proposed) + Approve / Reject buttons.
- Profile shows a yellow banner "X pending change(s) awaiting verification" when the viewing user can see them.

### Audit trail
- Every change request creation and review is captured by `AuditInterceptor` (IAuditable). The PayloadJson + ReviewerNote give a forensic trail.

## Phase G - Wealth declaration (item C, ~2 hr)

### Domain
New aggregate `MemberAsset`:
- Id, TenantId, MemberId
- Kind enum: RealEstate / Vehicle / Investment / ShareMarket / Business / Jewellery / Cash / Other
- Description (string max 500)
- EstimatedValue (decimal?), Currency (3-char)
- Notes (free text 1000)
- DocumentUrl (optional - re-using receipt-doc pattern)
- IAuditable + ITenantScoped

### Permission
`member.wealth.view` (new) - seeded to Administrator + Accountant + QH approvers + Counter
Members always see their own (no permission needed for self-view).

### UI
New "Wealth" tab on the member profile. Visible only to:
- The member themselves
- Anyone with `member.wealth.view`

Otherwise hidden entirely (not just disabled).

Each row: kind, description, value + currency, notes, doc upload. Add / Edit / Remove + IsHighest patterns from MemberEducation.

### Endpoints
- GET / POST / PUT / DELETE under `/api/v1/members/{id}/profile/assets`
- Upload sub-route reuses the existing IPhotoStorage / IReceiptDocumentStorage abstraction with a third slot

## Phase H - Roles + permission matrix (item D, ~3 hr)

### New roles seeded
- **DataEditor** - can submit member edits AND approve member change requests (member.self.update + member.changes.approve + member.view)
- **DataValidator** - approve change requests + photo verification (member.changes.approve + member.verify + member.view)
- **EventCoordinator** - already kind-of exists via test user "events"; formalise as a real role with event.view + event.manage + event.scan + member.view
- **EventVolunteer** - just event.scan + member.view

### Role-permission matrix UI
The existing UsersPage already has a "Roles & Permissions" tab that shows the matrix read-only. I'll make it editable:
- Click a role to open a drawer with all permissions grouped by area (Members / Receipts / Vouchers / Events / etc.)
- Toggle permissions per role
- Save persists role claims via the existing role-claim API

### Per-event role assignment (the user's "manage roles for events" line)
Events already have organisers via EventRegistrations; this is more about which app role can do what for events. The matrix above covers that.

If the user actually meant "who is responsible for this specific event" (event-level role assignment), that's a different feature - I'll flag it and not build it without confirmation.

## Phase I - E2E + commits + push

Tests for:
- Family tab is read-only
- Submitting a member edit creates a change request
- Admin queue lists + approves + rejects
- Wealth tab visibility gated by permission
- Role drawer toggles permissions
- New roles seeded with expected claims

## Gaps + defaults flagged

1. **Self-edit gate logic on the form** - if the logged-in user matches the member AND has self.update without member.update, the form routes through the queue. Otherwise direct edit (admin) or read-only (other members without permission).
2. **Wealth doc upload** - same pattern as the QH cashflow / gold-slip uploads. Two slots per asset row (or one per row).
3. **Change-request granularity** - section-level (one request per Tab save), not field-level. Simpler to review; matches the existing UpdateXxx services.
4. **Diff rendering** - JSON-tree view as v1 (clear but raw); a prettier per-field diff is a v2 polish.
5. **Permission seeded to existing admin** - the auto-reconcile loop in DatabaseSeeder already grants all new permissions to Administrator + the admin user on every startup. No data loss.
6. **Role-permission matrix - drawer UX** - I'll list permissions grouped by area with checkboxes. Save All button. Toast on success.

## Out of scope
- A flag-able "auto-approve trivial changes" rule
- Per-event role assignment (e.g. "X is the coordinator for the 1 May event") - separate feature
- Member self-service password reset
- Wealth declaration verification by appraiser

## Progress log
- 2026-04-30: Plan written. Beginning Phase E.
