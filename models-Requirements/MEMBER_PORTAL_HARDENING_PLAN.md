# Member Portal Hardening Plan

**Status:** Active. Owner: Niyas. Started: 2026-05-05.

---

## Overview

The member self-service portal at `/portal/me/*` is substantially functional today
(8 of 9 phases shipped) but four gaps degrade the experience:

1. **Routing inferred from permission shape** — fragile, hybrid users land on the wrong page.
2. **Profile is read-only** — biggest member-visible action is missing (E2 follow-up).
3. **No portal-driven notifications** — members must check back manually.
4. **Hardcoded English in portal layout** — non-English communities can't fully localise.
5. **Web-only** — no install-to-home-screen experience.

This plan delivers all five in five sequential phases. Self-registration (Phase 6
in the original analysis) is **deferred** — admin provisioning fits the curated
governance model and self-registration adds fraud surface that needs ITS verification
infrastructure not yet in place.

---

## Phase A — Permissions, routing, lazy-load

**Goal:** Replace permission-shape inference with an explicit `UserType` primitive,
isolate the portal bundle, and give members a memorable URL.

### Scope

| Item | Description |
|---|---|
| A.1 | New `ApplicationUser.UserType` enum: `Member` / `Operator` / `Hybrid`. EF migration. |
| A.2 | Seeder backfills `UserType` from existing roles (Member-only → Member; any operator role → Operator; both → Hybrid). |
| A.3 | `JwtTokenService` stamps `userType` claim into the JWT. |
| A.4 | `LoginPage.tsx` routes off `userType`. **Fallback** to current permission-shape inference for one release if the claim is absent (handles in-flight tokens). |
| A.5 | Lazy-load the portal chunk via `React.lazy` + `Suspense` so members never download operator JS. |
| A.6 | New `VITE_PORTAL_BASE` env var (default `/portal`) so the future move to `members.jamaat.com/me` is a config change, not a refactor. |
| A.7 | `/m` shortcut → 302 to `/portal/me`. Memorable URL members can bookmark. |
| A.8 | "Switch to member portal" link in operator topbar for Hybrid users. |
| A.9 | Admin Users page: new "Portal Access" panel — status, provision/disable/reset actions, **send welcome email**, view granular `portal.*` permissions as toggles. |
| A.10 | Welcome email template (EN/AR/HI/UR) + `INotificationSender` integration. Subject + body + magic-link to first-time `/login`. |

### Files to touch (anticipated)

- `src/Jamaat.Domain/Entities/UserType.cs` (new enum)
- `src/Jamaat.Infrastructure/Identity/ApplicationUser.cs` (new property)
- `src/Jamaat.Infrastructure/Persistence/Migrations/AddUserType.cs` (new)
- `src/Jamaat.Infrastructure/Persistence/Seed/DatabaseSeeder.cs` (backfill)
- `src/Jamaat.Infrastructure/Identity/JwtTokenService.cs` (claim)
- `src/Jamaat.Infrastructure/Identity/MemberLoginProvisioningService.cs` (sets UserType + welcome email)
- `web/jamaat-web/src/features/auth/LoginPage.tsx` (routing)
- `web/jamaat-web/src/app/App.tsx` (`React.lazy` boundaries, `/m` redirect)
- `web/jamaat-web/src/shared/config/env.ts` (new `portalBase`)
- `web/jamaat-web/src/app/AppLayout.tsx` (Hybrid switcher link)
- `web/jamaat-web/src/features/admin/users/PortalAccessPanel.tsx` (new)

### Test plan

- [ ] Migration applies cleanly; existing users get backfilled UserType
- [ ] JWT inspection shows new `userType` claim
- [ ] Member-only user lands on `/portal/me`; operator on `/dashboard`; hybrid on `/dashboard` with switcher visible
- [ ] Operator JS chunk does not load when a member visits `/login` → portal
- [ ] `/m` redirects to `/portal/me`
- [ ] Admin clicks "Send welcome email" → member receives the email (or NotificationLog row in dev)
- [ ] Tokens issued before the migration still route correctly (fallback path)

**Effort:** ~1.5 days. **Risk:** medium (login routing is high blast radius; needs the fallback).

---

## Phase B — Self-edit profile (E2 follow-up)

**Goal:** Replace the read-only profile view with a real edit form that creates change
requests for sensitive fields.

### Scope

| Item | Description |
|---|---|
| B.1 | Edit form on `/portal/me/profile` for: phone, email, address (city/area), photo upload. |
| B.2 | Submit creates a `MemberChangeRequest` (status = Pending). Existing approval flow at `/admin/change-requests` consumes it. |
| B.3 | Photo upload reuses `IPhotoStorage` + existing endpoint. |
| B.4 | "Pending review" banner shown on profile while a request is open. |
| B.5 | Family-tree links remain read-only this round; clearly marked "edit via support." |

### Files to touch

- `src/Jamaat.Application/Members/MemberChangeRequestService.cs` (verify portal-side payloads accepted)
- `src/Jamaat.Api/Controllers/PortalMeController.cs` (add `GET /me/profile/pending-changes`)
- `web/jamaat-web/src/features/portal/me/MemberPortalPages.tsx` (replace read-only block with form)
- New: `web/jamaat-web/src/features/portal/me/ProfileEditForm.tsx`

### Test plan

- [ ] Member edits phone → sees pending banner
- [ ] Admin approves at `/admin/change-requests` → banner clears, value updated
- [ ] Photo upload round-trips
- [ ] Validation errors display inline (not as modal)

**Effort:** ~1 day. **Risk:** low (approval flow already proven).

---

## Phase C — Notifications

**Goal:** Three high-value triggers that drive portal re-engagement.

### Scope

| Item | Description |
|---|---|
| C.1 | New `Application/Notifications/MemberNotifier.cs` — adapter that resolves member's preferred channel + locale, renders templates. |
| C.2 | Trigger 1: **Commitment installment due (T-3d)**. Hangfire daily scan → email/SMS. |
| C.3 | Trigger 2: **QH state change** (any transition Approved-L1 / -L2 / Disbursed / Closed). Domain-event handler. |
| C.4 | Trigger 3: **Event reminder (T-24h)**. Hangfire daily scan over confirmed registrations. |
| C.5 | Templates seeded into the new CMS infra (`cms.NotificationTemplate` table) — admin-editable from CMS admin screen. |
| C.6 | Per-member channel preferences (`Member.NotificationPrefs`): which channels (email/SMS/WhatsApp), which event types. Sensible defaults. |
| C.7 | Notifications settings tab on `/portal/me/profile`. |

### Files

- New: `src/Jamaat.Application/Notifications/MemberNotifier.cs`, `IMemberNotifier.cs`
- New: `src/Jamaat.Infrastructure/BackgroundJobs/CommitmentDueScanJob.cs`, `EventReminderScanJob.cs`
- Domain event handlers under `src/Jamaat.Application/QarzanHasana/Events/`
- New: `cms.NotificationTemplate` entity + migration
- Member entity: new `NotificationPrefs` value object (or JSON column)
- SPA: notifications tab on profile

### Test plan

- [ ] Manually trigger Hangfire jobs → email lands in NotificationLog (LogOnly mode in dev)
- [ ] QH state change → handler fires, NotificationLog row appears
- [ ] Member opts out of SMS → trigger sends email only
- [ ] Template edited in CMS admin → next send uses new copy

**Effort:** ~2 days. **Risk:** medium (provider configs vary per tenant; SMS/WhatsApp credentials needed for live test).

---

## Phase D — Portal i18n

**Goal:** Every user-facing string in the portal is translatable.

### Scope

| Item | Description |
|---|---|
| D.1 | New `public/locales/<lang>/portal.json` namespace (EN/AR/HI/UR). |
| D.2 | Wrap all strings in `MemberPortalLayout` and `MemberPortalPages` in `t('portal.*')`. |
| D.3 | Language switcher in avatar dropdown (reuses existing `<LanguageSwitcher>`). |
| D.4 | New `PUT /api/v1/portal/me/preferences` endpoint to persist `PreferredLanguage` server-side. |
| D.5 | Seed translations: EN literal copy, AR/HI/UR machine-translated placeholders marked `[REVIEW]` for human pass. |

### Files

- New JSON locale files under `web/jamaat-web/public/locales/<lang>/portal.json`
- `MemberPortalLayout.tsx`, `MemberPortalPages.tsx`, `MemberHomePage.tsx` (string wrap)
- `PortalMeController.cs` (new preferences endpoint)
- `ApplicationUser` already has `PreferredLanguage`

### Test plan

- [ ] Switch language in avatar dropdown → portal re-renders in chosen language
- [ ] Refresh / re-login → language persists
- [ ] AR shows RTL layout (existing CSS logical properties handle this)
- [ ] Untranslated keys fall back to EN gracefully

**Effort:** ~1 day. **Risk:** low.

---

## Phase E — PWA shell

**Goal:** Members can install the portal to their phone home screen.

### Scope

| Item | Description |
|---|---|
| E.1 | `vite-plugin-pwa` installed and configured. |
| E.2 | Web app manifest (`manifest.json`) with Jamaat icons in 192/512px. |
| E.3 | Service worker caches the shell + last-fetched portal data. |
| E.4 | Offline banner shown when network is unreachable but cached data is present. |
| E.5 | "Install app" prompt on first portal visit only, dismissible, "don't show again" persisted in localStorage. Never shown to operators. |

### Files

- `web/jamaat-web/vite.config.ts` (add plugin)
- `web/jamaat-web/public/manifest.json` (new)
- `web/jamaat-web/public/icons/portal-192.png`, `portal-512.png` (new)
- New: `web/jamaat-web/src/shared/pwa/InstallPrompt.tsx`
- `MemberPortalLayout.tsx` (mount InstallPrompt + offline banner)

### Test plan

- [ ] Lighthouse PWA audit ≥ 90
- [ ] iOS Safari "Add to Home Screen" works
- [ ] Chrome Android shows install banner
- [ ] Offline mode: open portal with network off → cached shell renders, banner shows
- [ ] Operator does not see install prompt

**Effort:** ~0.5 days. **Risk:** low (additive).

---

## Sequencing

| # | Phase | Effort | Why this order |
|---|---|---|---|
| 1 | A — Permissions, routing, lazy-load | 1.5d | Foundation; everything else routes through this |
| 2 | B — Self-edit profile | 1d | Highest member-visible win |
| 3 | C — Notifications | 2d | Drives portal re-engagement |
| 4 | D — Portal i18n | 1d | Before non-English communities go live |
| 5 | E — PWA shell | 0.5d | Cheap polish, ships last |

**Total: ~6 days, 5 commits (one per phase).**

Each phase ships its own commit + push, with a **per-phase test report** in the commit
message — no claiming "done" from compilation alone.

---

## Out of scope (deferred)

| Item | Why deferred |
|---|---|
| Self-registration (`/portal/register` + admin moderation queue) | Curated governance model fits admin-provisioning. Add if/when an open community needs it. |
| Subdomain split (`members.jamaat.com`) | Premature for current member volume. The `VITE_PORTAL_BASE` config var added in Phase A keeps this a future config change, not a refactor. |
| Native mobile apps | The PWA shell in Phase E gives 80% of the value. Native is a separate decision. |
| GDPR data-export ("download my data") | Add when first member asks. |
| Per-tenant notification template overrides | Templates ship in CMS as global; per-tenant variants land if/when tenants ask. |

---

## Permission summary (post-Phase A)

After Phase A, the routing model is:

| User has | UserType | Default landing | Can access |
|---|---|---|---|
| Only `portal.*` perms | `Member` | `/portal/me` | Portal only |
| Any operator perm, no Member role | `Operator` | `/dashboard` | Operator app + can visit `/portal/me` (sees own data) |
| Both | `Hybrid` | `/dashboard` | Both. Topbar shows "Switch to member portal" link |

The 10 `portal.*` permissions remain unchanged. The change is **how routing decides where to send users** — explicit `UserType` instead of inferring from permission shape.
