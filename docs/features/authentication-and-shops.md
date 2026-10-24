# Feature: Authentication, Shops, Membership, Devices, Settings

Status: Planned · Phase: 02 · Requirements: FR-01, FR-02, FR-23 (foundation), FR-26

## Purpose
Let a shopkeeper sign in with their phone, create or join a shop, invite staff, register the device, and
configure basic shop settings — with tenant isolation in place from the first table.

## Screens and ViewModels
| Screen | ViewModel | State model |
|---|---|---|
| LoginScreen | useLoginViewModel | `idle → sendingOtp → otpSent → error` |
| OtpScreen | useOtpViewModel | `entering → verifying → verified → error`, resend countdown |
| CreateShopScreen | useCreateShopViewModel | form (RHF+Zod) `editing → submitting → created → error` |
| SelectShopScreen | useSelectShopViewModel | `loading → loaded(memberships, invitations) → error` |
| LanguageScreen | useLanguageViewModel | local preference + profile update |
| StaffScreen | useStaffViewModel | members list, invite form, role change, deactivate |
| SettingsScreen (+ sections) | useShopSettingsViewModel | `loading → loaded → saving → saved → error` |

## User actions
sendOtp(phone) · verifyOtp(code) · resendOtp · createShop(form) · acceptInvitation(id) · selectShop(id) ·
setLanguage · inviteMember(phone, role) · changeRole · deactivateMember · revokeDevice · updateSettings(patch) · signOut.

## Use cases
`SendOtp`, `VerifyOtp`, `LoadMyContext`, `CreateShop`, `AcceptInvitation`, `SelectActiveShop` (also registers device if needed),
`InviteMember`, `ChangeMemberRole`, `DeactivateMember`, `UpdateShopSettings`, `SignOut` (checks unsynced data from Phase 09).

## Repository interfaces
- `AuthRepository`: `sendOtp`, `verifyOtp`, `getSession`, `signOut`, `onSessionChange`.
- `ShopRepository`: `getMyContext`, `createShop`, `getSettings`, `updateSettings`.
- `MembershipRepository`: `listMembers`, `invite`, `acceptInvitation`, `changeRole`, `deactivate`.
- `DeviceRepository`: `registerDevice`, `getLocalDevice` (SecureStore), `revokeDevice`.

## Data sources
| Data source | Calls |
|---|---|
| SupabaseAuthDataSource | `auth.signInWithOtp`, `auth.verifyOtp`, `auth.signOut` |
| SupabaseShopDataSource | `rpc get_my_context`, `rpc create_shop`, `from('shop_settings').select`, `rpc update_shop_settings` |
| SupabaseMembershipDataSource | `rpc invite_shop_member`, `accept_shop_invitation`, `update_member_role`, `deactivate_member`, `from('shop_members')…` |
| SupabaseDeviceDataSource / SecureDeviceStore | `rpc register_device`, `revoke_device`; device id in SecureStore |

## Database
Tables: `profiles`, `shops`, `shop_settings`, `shop_members`, `shop_invitations`, `shop_devices`, `invoice_series`,
`role_permissions`, `platform_admins`, `audit.events`, plus seed of `entitlement_definitions`, `subscription_plans`
(`free_trial`, `free_tier`), `units`, `tax_rates`, `expense_categories` system rows.
Triggers: new auth user → `profiles`; last-owner guard; `updated_at`.
RPCs: `get_my_context`, `create_shop`, `update_shop_settings`, `invite_shop_member`, `accept_shop_invitation`,
`update_member_role`, `deactivate_member`, `register_device`, `revoke_device`, `get_shop_entitlements` (basic), `get_client_config` (basic).

## Validation
| Rule | Client | Server |
|---|---|---|
| Phone E.164 India (+91, 10 digits starting 6–9) | Zod | Auth + RPC |
| Shop name 2–80 chars | Zod | check constraint |
| Invite role ∈ {manager, cashier} | Zod | RPC |
| Last active owner cannot be demoted/deactivated | UI disables | trigger |
| Settings patch matches schema | Zod (`ShopSettingsPatchSchema`) | RPC validates enums/ranges |

## Errors
`DS_AUTH_REQUIRED` → back to login · OTP invalid/expired (Auth error) → inline message · `DS_QUOTA_EXCEEDED(staff_accounts.max)` → plan upsell sheet ·
`DS_PERMISSION_DENIED` → forbidden state · `NETWORK_*` → retry banner.

## Authorization
`staff.manage` for membership changes, `settings.manage` for settings (owner). Any authenticated user can create a shop
(rate-limited: max 3 shops per user unless platform override).

## Tests
- pgTAP: S-01 on all Phase 02 tables; owner/manager/cashier matrix for each RPC; last-owner trigger; invitation phone match;
  deactivated member denied immediately; device quota.
- Unit: phone normalisation; ViewModels for OTP flow (resend timer, wrong code, success), create shop (validation, duplicate submit).
- E2E: J-01 up to landing on Bill screen (with test OTP number).

## Acceptance criteria
- [ ] New user can sign in with a test phone number and create a shop; lands on Bill tab.
- [ ] Owner invites a cashier; cashier signs in and sees only cashier navigation.
- [ ] Shop A user cannot read any Shop B row (automated test passes).
- [ ] Deactivating a member blocks their next request.
- [ ] Settings changes persist and are audited.

## Limitations
Real SMS delivery requires OD-02. Shared-device staff switching is out of scope (OD-06).
