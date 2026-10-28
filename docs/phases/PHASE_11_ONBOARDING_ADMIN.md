# Phase 11 — Managed Onboarding and Operations Admin Panel

Status: **Complete — awaiting approval** · Date: 2026-10-28 · Spec:
[../features/onboarding-and-support.md](../features/onboarding-and-support.md),
[../ADMIN_PANEL_SPECIFICATION.md](../ADMIN_PANEL_SPECIFICATION.md)

## Features implemented (end-to-end)

### 1. Managed onboarding ("set up my items for me")
1. **App, Items tab:** shops whose plan has `onboarding.managed` and members with `onboarding.request` see a card:
   *Too many items to type?* → **Set up my items** (`OnboardingRequestScreen`): method (photos / Excel file / call me),
   phone (optional, checked as an Indian mobile), best time, note, up to 30 photos (camera or gallery).
2. `RequestOnboarding`: `create_onboarding_request` (request id fixed per form → a retry returns the same request; a
   second open request is refused) → each photo uploaded to `onboarding-files/<shop>/<request>/photo-NN.ext` and
   recorded with `add_onboarding_file` (fixed names + `on conflict do nothing` → a retry adds no duplicates).
3. **Admin, Onboarding queue** (super_admin, onboarding_operator): columns New / Assigned / In progress / Waiting for
   owner. The request page opens the shop's photos through 5-minute signed links and offers only the allowed steps
   (new → assigned | cancelled; assigned → in progress | back to queue | cancelled; in progress → send to owner |
   cancelled; waiting for owner → in progress).
4. The operator types the list into a CSV (same columns as the app's import) and uploads it: the panel parses it with
   `@ds/domain-core` (`parseCsv`, `mapImportTable`, batches of 1000) → `admin_create_import_job` (once per request;
   moves it to *in progress*) → `admin_stage_import_rows` (same validation as the shop's own import).
5. **Send to owner** (with an optional message) → the app card says *Your item list is ready* → **Check and add
   items** opens the import review on that job (`get_import_job`); the owner fixes or skips rows and commits as usual.
   Committing completes the request (trigger). Nothing reaches the catalogue without the owner's commit (ADR-062).

### 2. Help & support
- **App, More → Help & support** (`support.create`; cashiers too): list of the member's tickets (owners/managers see
  the shop's), **Ask a question** (category, title, message; id fixed per form), thread with our replies, reply box;
  a reply reopens a solved ticket, closed tickets are read-only. Internal notes never reach the phone (RLS).
- **Admin, Support** (super_admin, support_agent): queue of open tickets, most urgent and longest-waiting first;
  search by subject or shop; thread with internal notes highlighted; reply or add an internal note; status, priority,
  assign to me / unassign.

### 3. Announcements
- **Admin, Announcements** (super_admin, support_agent): create/edit (English + Hindi title and message, severity,
  optional show-from/until in India time), publish, unpublish, archive. Publishing a *critical* one needs super_admin
  (checked in the database).
- **App, Home:** banner per live announcement (`get_announcements`), in the app language with English fallback;
  info/warning can be dismissed until the app restarts, critical cannot.

### 4. Operations admin panel (Next.js 16)
- **Sign-in with MFA:** password → `/mfa` (enrol a TOTP authenticator with QR code, or enter the code) → aal2. Every
  page and server action calls `requireOperator(roles)`; every admin RPC checks role **and** aal2 again
  (`private.require_platform_role`). Navigation shows only the role's modules.
- **Dashboard:** shops, active in 7 days, new shops, open onboarding, open tickets, bills today.
- **Shops:** search (name, city, ≥ 4 phone digits), status filter, paging; shop page with plan, members, devices,
  recent audit; suspend/reactivate with reason and confirmation; deactivate a member; revoke a device.
- **Audit log** (super_admin): filters (shop, action prefix, actor kind), paging by id; before/after/reason.
- **Operators** (super_admin): list with MFA status; change role or disable with an audited reason (never oneself);
  **invite** by email through the Edge Function `admin-invite-operator` (service role only there; the role grant runs
  as the caller through `admin_add_operator`, so it is checked and audited).

## Mobile
- **New feature `onboarding`:** entities, `OnboardingRepository`, use cases `RequestOnboarding`, `GetLatestOnboarding`,
  `toIndianMobile`; `SupabaseOnboardingDataSource` (RLS read with files, RPCs, storage upload); view models
  `useOnboardingStatusViewModel`, `useOnboardingRequestViewModel`; `OnboardingStatusCard`, `OnboardingRequestScreen`.
- **New feature `support`:** `SupportRepository`, use cases `ListTickets`, `GetTicketThread`, `CreateTicket`,
  `ReplyToTicket`, `GetAnnouncements`, `localized`; `SupabaseSupportDataSource`; view models in
  `useSupportViewModels`; `SupportScreen`, `NewTicketScreen`, `TicketScreen`, `AnnouncementBanner`.
- **Imports:** `GetImportJob` + `ImportRepository.getJob`; the import screen opens a prepared job (`/import?jobId=`).
- **Routes:** `setup-help`, `help`, `help-new`, `help-ticket`; More entry *Help & support*; Items tab banner slot;
  Home banner.
- **Strings:** en + hi, 695 keys each.

## Admin (apps/admin)
`core/admin` (`rpc`, `AdminRpcError`, `adminAction`, `withParam`), `core/ui`, features `navigation` (modules by role),
`authentication` (MFA actions + form), `shops`, `onboarding` (state machine, CSV → batches), `support`, `audit`,
`announcements` (form → input, India time), `operators`; pages under `app/(admin)/…` and `app/mfa`.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261028075617_p11_onboarding_support_admin` | `onboarding_requests`, `onboarding_files`, private bucket `onboarding-files` + storage policies; `support_tickets`, `support_messages` (RLS hides internal notes); `announcements`; shop RPCs `create_onboarding_request`, `add_onboarding_file`, `get_import_job`, `create_support_ticket`, `add_ticket_message`, `get_announcements`; trigger completing onboarding on commit; `private.stage_rows` shared by shop and operator staging; helpers `private.require_platform_role`, `rls.is_platform_admin`, `private.mask_phone`; admin RPCs (dashboard, shops, onboarding, support, audit, announcements, operators) — all audited |
| `20261028080050_p11_add_operator` | `admin_add_operator` (super_admin, audited `admin.operator_invited`) |

Edge Function source `supabase/functions/admin-invite-operator` — **not deployed yet** (see below).

## Tests executed (2026-10-28)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **536 / 536** (19 suites; onboarding 13, support 6, imports +2, More list per role) |
| admin (Vitest) | **26 / 26** (module access per role, onboarding steps match the DB, CSV mapping and 1000-row batches, announcement form and India time, error texts, sign-in) |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **386 / 386** assertions (new `018_onboarding_support_admin` 41) |
| DB pgTAP + storage on real Supabase (CI) | see PROJECT_STATUS.md §3 (run on the Phase 11 commits) |

**App:** Indian mobile numbers; request + photos are idempotent on retry; photos required for the photo method;
card offer / hidden without entitlement / progress / ready to check / no review button without `product.manage`;
request screen validation and send; ticket validation (title, empty, too long); new ticket → thread; our reply shown,
shop reply reopens; closed ticket read-only; announcement language fallback; info dismissible, critical not; opening a
prepared import and committing it; an already-added import explained; More list per role.
**Database:** cashier cannot request onboarding; one open request per shop; operator without MFA refused; roles
scoped (support cannot open onboarding or suspend shops; shop owner is not an operator); state machine; staging only
while in progress; owner commit completes the request; internal notes invisible to the shop; a shop reply reopens;
critical announcement only by super admin; operator cannot change themself; every admin change audited.

Static checks: format ✅, typecheck ✅ (all workspaces), lint ✅, admin `next build` ✅ (13 routes, all dynamic).

## Acceptance criteria
- [x] Operators sign in with MFA; role-scoped modules (UI guard + database check of role and aal2).
- [x] Onboarding request → operator import → owner approval → commit (owner always approves in v1, ADR-062).
- [x] Support tickets end-to-end with internal notes hidden (RLS + tests).
- [x] Every admin mutation audited; S-03 passes (shop users and operators without aal2 are refused by every
  `admin_*` RPC tested).

## Decisions (DECISIONS.md)
ADR-062 the owner always commits an operator-prepared import · ADR-063 one MFA-checked database gate for all admin
RPCs; the panel's guard is convenience · ADR-064 operator invites only through an Edge Function holding the service
role; the grant itself is an audited RPC run as the caller · ADR-065 admin forms are server actions that redirect
with `?error=DS_…` (no client state; work without JavaScript).

## Known limitations (Phase 11)
- `admin-invite-operator` is not deployed: run
  `npx supabase functions deploy admin-invite-operator --project-ref qrrhakcmkgmxiyhwyqwg`. Until then the invite
  button shows an error; existing operators can be managed.
- "Operator may commit" is stored but not offered: owners approve every prepared import.
- Shops send photos only from the app; spreadsheets are collected by our team (call). Operators upload a CSV, not
  Excel.
- Notification templates (BL-1111) and push/WhatsApp notices for new replies are not built; the app shows replies
  when the help screen is opened.
- No "replace owner" / ownership transfer in the admin panel; memberships can be deactivated only.
- No CAPTCHA on the admin login and no hosting yet (OD-14).
- Announcement dismissals are kept only until the app restarts.

## External configuration still required
Deploy the Edge Function (above); admin hosting (OD-14) with `NEXT_PUBLIC_SUPABASE_URL` / anon key; CAPTCHA keys if
wanted; the first super admin row in `platform_admins` (already present on dev). Otherwise unchanged (email template
`{{ .Token }}`, SMS provider, EAS/dev build and test phone, push credentials, printers).

## Recommended next phase
Phase 12 — subscriptions, plans, feature flags and entitlements (admin editors build on this panel).
