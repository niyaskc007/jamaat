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

## Phase F — Self-registration (shipped 2026-05-05, commit `62e4abe`)

Public `/register` form + admin moderation queue at `/admin/applications`. Anonymous
submission creates a `MemberApplication` row; approval provisions an `ApplicationUser`
via the existing `IMemberLoginProvisioningService` and emails the applicant a welcome
message + temporary password. Rejection requires a reviewer note, and (after Phase G)
the applicant gets an email explaining why.

Originally deferred under the "out of scope" list below; promoted to a full phase
after the original 5-phase plan shipped.

---

## Phase G — Rejection + new-device-login notifications (shipped 2026-05-05)

- New `NotificationKind.ApplicationRejected (9)`. Wired into
  `MemberApplicationService.RejectAsync` so the applicant receives the reviewer note
  via the same `INotificationSender` plumbing as approve/welcome.
- New `NotificationKind.NewDeviceLogin (10)`. `LoginAuditService.RecordAsync` now
  detects "new IP for this user" after a successful login and fires a security email.
  Skipped on first-ever login (welcome email already covers it) and on repeats from
  known IPs to avoid noise.
- Receipt-confirmed notifications were already wired in `ReceiptService` from a
  prior release; no change needed.

---

## Phase H — Operator bundle code-split (shipped 2026-05-05)

Initial JS bundle dropped from **3.14 MB → 732 KB** (76% reduction) by lazy-loading
every operator page (admin/*, dashboards/*, reports, ledger, accounting, members,
events, receipts, vouchers, qarzan-hasana, system/*) plus the operator
dashboard. Auth flow + chrome stay eagerly imported because they're on the boot path.

Members never load operator JS; operators only load each operator page on first navigation.
Builds now produce ~50 small chunks with proper route-level splitting; the PWA precache
manifest carries them all so post-install offline navigation still works.

---

## Phase I — Full AR/HI/UR portal translations (shipped 2026-05-05)

Every key in `en/portal.json` now has matching machine translations in `ar/`, `hi/`,
`ur/`. The `_meta` field still flags them as `[REVIEW]` — production deployments should
have a native speaker pass before going live.

---

## Out of scope (deferred)

| Item | Why deferred |
|---|---|
| Native mobile apps | The PWA shell in Phase E gives 80% of the value. Native is a separate decision. |
| GDPR data-export ("download my data") | Add when first member asks. |
| Per-tenant notification template overrides | Templates ship in CMS as global; per-tenant variants land if/when tenants ask. |
| Hangfire dashboard | The hosted-service-with-PeriodicTimer pattern from Phase C is sufficient at this scale. Hangfire's value is the dashboard + retry semantics; revisit if jobs grow beyond the 3 we have. |
| Native push notifications | Email/SMS/WhatsApp covers it; web push needs VAPID + service worker + browser-permission UX that's not worth the complexity for current member count. |

---

## Subdomain split — deployment guide

The `VITE_PORTAL_BASE` env var added in Phase A makes splitting `members.jamaat.com` a
deploy-time decision, not a code change. Steps when you're ready:

### Single-domain (current default)
- One Kestrel host serving both API and SPA at e.g. `app.jamaat.com`
- Members hit `app.jamaat.com/portal/me`; operators hit `app.jamaat.com/dashboard`
- `VITE_PORTAL_BASE` defaults to `/portal`; nothing to set

### Split-subdomain (when you want it)
- DNS: point `app.jamaat.com` and `members.jamaat.com` at the same Kestrel host (or
  separate hosts behind a load balancer).
- Build the SPA twice with different env vars:
  ```bash
  # Operator build
  VITE_PORTAL_BASE=/portal npm run build
  # → deploy to app.jamaat.com

  # Member build
  VITE_PORTAL_BASE='' npm run build
  # → deploy to members.jamaat.com (the portal lives at the root, /me etc.)
  ```
- The `/m` shortcut redirects to `${env.portalBase}/me` so it works in both modes.
- JWT cookies: set the cookie domain to the parent (`.jamaat.com`) so a single login
  carries across both subdomains. Already configured this way in
  `Program.cs` JWT options if you set `Jwt:CookieDomain` to `.jamaat.com`.
- CORS: add both origins to `Cors:Origins` in `appsettings.json`.
- CSP: if you set one, allow both origins as `connect-src`.

### Why split at all
- Brand clarity: members never see admin URLs.
- Marketing: bookmarkable `members.jamaat.com` is easier to share.
- Independent deploy cadence: hot-fix the operator dashboard without touching member
  bundles.
- Bundle size: each subdomain only ships its own audience's chunks, smaller initial
  download than even the lazy-loaded shared build.

Trade-off: two SPA builds + two CDN/host configs to maintain. Not worth doing until
member count ≫ operator count or when marketing genuinely needs the URL.

---

---

## Permission summary (post-Phase A)

After Phase A, the routing model is:

| User has | UserType | Default landing | Can access |
|---|---|---|---|
| Only `portal.*` perms | `Member` | `/portal/me` | Portal only |
| Any operator perm, no Member role | `Operator` | `/dashboard` | Operator app + can visit `/portal/me` (sees own data) |
| Both | `Hybrid` | `/dashboard` | Both. Topbar shows "Switch to member portal" link |

The 10 `portal.*` permissions remain unchanged. The change is **how routing decides where to send users** — explicit `UserType` instead of inferring from permission shape.
