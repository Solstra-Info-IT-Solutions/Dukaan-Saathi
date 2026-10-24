# Phase 02 — Authentication, Tenant Membership, Shop Setup, Foundational RLS

Status: **Complete — awaiting approval** · Date: 2026-10-24 · Spec: [../features/authentication-and-shops.md](../features/authentication-and-shops.md)

## Features implemented (end-to-end)

### 1. Sign-in (phone OTP default, email OTP fallback)
`LoginScreen` → `useLoginViewModel` → `RequestOtp` (normalises +91 numbers / emails, throws `AuthInputError`) →
`AuthRepository` → `SupabaseAuthDataSource.signInWithOtp` → Supabase Auth.
`OtpScreen` → `useOtpViewModel` (30 s resend countdown, duplicate guard) → `VerifyOtp` → `verifyOtp` → session stored by
the chunked SecureStore adapter. Supabase Auth error codes map to `AUTH_OTP_INVALID`, `AUTH_PROVIDER_UNAVAILABLE`, `DS_RATE_LIMITED`.

### 2. Session restore and routing
`SessionController` (bootstrap) listens to Supabase Auth. On a new user id → `RestoreSession`: `get_my_context` + last shop id →
`pickInitialShop` → `ActivateShop` (`register_device` → device code + invoice series) → `sessionStore`.
Expo Router `Stack.Protected` switches between `(auth)`, `(onboarding)` and `(shop)`; token refreshes do not re-run the restore.

### 3. Create / select / join a shop
`CreateShopScreen` (React Hook Form + Zod) → `useCreateShopViewModel` → `CreateShop` → `create_shop` RPC: one transaction creates
shop + settings + owner membership + 30-day trial + audit, idempotent by `clientOperationId` (same key on retry, new key after edits).
`SelectShopScreen` lists memberships and pending invitations; joining calls `accept_shop_invitation` (phone/email must match the
verified contact; otherwise `DS_NOT_FOUND`) and opens the shop.

### 4. Staff and devices (owner)
`StaffScreen` → `useStaffViewModel` → `LoadStaff` (`list_shop_members` RPC + RLS reads of `shop_invitations`, `shop_devices`),
`InviteMember` (`invite_shop_member`, quota `staff_accounts.max`), role change / remove (confirmation dialog) / revoke device via
`StaffRepository`. Removing a member revokes their devices; their next request is denied (membership checked per call).

### 5. Shop settings (owner)
`ShopSettingsScreen` → `useShopSettingsViewModel` (draft = server values + local edits, diffed patch) → `UpdateShopSettings`
(Zod mirror of DB checks) → `update_shop_settings` RPC (unknown keys rejected, audited).

### 6. Shop home and More
`ShopHomeScreen` shows role, this phone's bill series (`DS/2627/A`) and plan/trial days from `get_shop_entitlements`.
`MoreScreen` shows only modules the role may open (`visibleModules`); routes are also wrapped in `RequirePermission`.

## Inventory
- **Screens / ViewModels:** Login/useLogin, Otp/useOtp, SelectShop/useSelectShop, CreateShop/useCreateShop, ShopHome/useShopHome,
  ShopSettings/useShopSettings, Staff/useStaff, More/useMore (+ Diagnostics from Phase 01).
- **Use cases:** RequestOtp, VerifyOtp, SignOut, LoadMyContext, ActivateShop, RestoreSession, CreateShop, AcceptInvitation,
  GetShopSettings, UpdateShopSettings, GetShopEntitlements, LoadStaff, InviteMember; pure: `pickInitialShop`, `trialDaysLeft`,
  `toOtpDestination`, `parseInviteContact`, `diffPatch`.
- **Repository interfaces → implementations:** AuthRepository → AuthRepositoryImpl; ShopRepository → ShopRepositoryImpl;
  DeviceRepository → DeviceRepositoryImpl; LastShopPreference → KeyValueSlot; StaffRepository → StaffRepositoryImpl.
- **Data sources:** SupabaseAuthDataSource, SupabaseShopDataSource, SupabaseStaffDataSource; local: SecureStore installation id
  and last-shop slot.
- **Contracts added (`@ds/contracts/shops`):** MyContext, Membership, Invitation, CreateShopInput/Output, ShopSettings,
  ShopSettingsPatch, RegisterDeviceOutput, ShopMember, ShopEntitlements; client error codes AUTH_OTP_INVALID,
  AUTH_PROVIDER_UNAVAILABLE, BACKEND_NOT_CONFIGURED; `uuidv7` in domain-core.

## Database (applied to `dukaan-saathi-dev`, ap-south-1)
| Migration | Content |
|---|---|
| `20261024132332_p01_baseline` | (Phase 01) |
| `20261024132619_p02_tenancy` | `rls` schema; profiles (synced from auth.users), shops, shop_settings, shop_members (last-owner trigger), shop_invitations (phone or email), shop_devices, invoice_series, role_permissions; plans, entitlement definitions, plan entitlements, subscriptions, overrides, platform_config; idempotency keys; entitlement resolution + quota helpers; 15 RPCs; seeds |
| `20261024132657_p02_fk_indexes` | Covering indexes flagged by the performance advisor |
| `20261024133107_p02_member_listing` | `list_shop_members` |

RPCs: get_my_context, update_my_profile, create_shop, get_shop_settings, update_shop_profile, update_shop_settings,
invite_shop_member, accept_shop_invitation, revoke_shop_invitation, update_member_role, deactivate_member, register_device,
revoke_device, get_shop_entitlements, list_shop_members, get_client_config (anon).

**RLS / security:** RLS on every public table; client roles have SELECT only on 7 tables (rows filtered by `rls.is_member` /
`rls.has_permission`); no INSERT/UPDATE/DELETE grants anywhere — all writes are SECURITY DEFINER RPCs with `search_path = ''`
that re-check membership, role and shop status per call. Entitlement, plan, subscription and config tables have no client
grants (S-05). Supabase security advisor: only expected findings (RPC-only tables without policies; intended RPCs callable by
`authenticated`; `get_client_config` callable by `anon` by design).

Live API probe with the publishable key as anon: `get_client_config` ✅ returns config; `get_my_context`, `shops`,
`plan_entitlements` → 42501 ✅.

## Tests executed (2026-10-24)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **87 / 87** (6 suites) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **26 / 26** |
| @ds/domain-core | **61 / 61** |
| DB pre-check (PGlite) | **101 / 101** assertions, 7 test files |
| DB pgTAP on real Supabase (CI `database` job) | passed for `ca2cf4b` and `f8f88cf` (tenancy, cross-tenant probe, member listing included) |

Security tests covered: S-01 (generic cross-tenant probe over every `shop_id` table + shops/profiles), S-02 (cashier denied
settings/invite), S-03 (Phase 01: shop user cannot use platform role), S-05 (client cannot read plan entitlements or insert
overrides), S-07 (privilege catalogue incl. `rls` schema, anon allow-list), S-08 (direct inserts/updates denied), S-10
(deactivated member loses access immediately).

Static checks: format ✅, typecheck (4 workspaces) ✅, lint ✅ (0 warnings), admin `next build` ✅, Android Metro export ✅.

Bugs found by tests and fixed: UPI regex `{2,256}` exceeds Postgres' 255 repetition limit (would have failed on real Postgres);
`email: ""` for phone-only Supabase users mapped to `""` instead of `null`; Paper TextInputs had no accessibility label
(screen readers and tests could not find them).

## Acceptance criteria
- [~] New user signs in and creates a shop; lands on the Shop tab — implemented and covered by component/ViewModel tests and the
  RPC tests; **not yet exercised on a device**, because the dev project's Auth must first be configured (see below).
- [x] Owner invites a cashier; cashier sees only cashier navigation (RPC tests + `visibleModules` / `RequirePermission` tests).
- [x] Shop A user cannot read any Shop B row (automated probe passes).
- [x] Deactivating a member blocks their next request.
- [x] Settings changes persist and are audited.

## External configuration still required (you, in the Supabase dashboard of `dukaan-saathi-dev`)
1. **Email OTP for development:** Auth → Email Templates → "Magic Link": include `{{ .Token }}` so the email contains the 6-digit
   code (the app verifies codes, not links). Supabase's built-in email sender is heavily rate-limited (a few per hour).
2. **Phone OTP:** Auth → Providers → Phone: enable with an SMS provider (OD-02; Twilio / MessageBird / Vonage, or a custom SMS
   hook for MSG91). Test phone numbers with fixed OTPs can then be added for development.
3. Optional: Auth → URL configuration is not needed (no magic links / deep links used).

## Known limitations (Phase 02)
- Mobile app not run on a device/emulator in this environment.
- The DB migration files contain explanatory comments that were stripped from the copy applied through the Supabase MCP; SQL
  statements are identical (CI applies the files themselves to a fresh database).
- Shop profile editing (name/city) RPC exists (`update_shop_profile`) but has no screen yet.
- `get_client_config` returns platform config only; flags/announcements/content arrive in Phase 12.
- Language choice is not yet saved to the profile (`update_my_profile` exists; UI in diagnostics only).

## Recommended next phase
Phase 03 — product catalogue, categories, units, tax rates, import.
