# Feature: Subscriptions, Plans, Entitlements, Feature Flags (client side)

Status: Planned · Phase: 02 (resolution basics + trial), 12 (full) · Requirements: FR-22

## Purpose
Turn plans into enforced capabilities without scattering `if (plan === 'pro')` through the code.

## Mobile
| Screen | ViewModel |
|---|---|
| PlanScreen (current plan, status, renewal date, usage bars, compare plans, contact sales) | usePlanViewModel |
| UpsellSheet (shown on `DS_ENTITLEMENT_REQUIRED` / `DS_QUOTA_EXCEEDED`) | useUpsellViewModel |

Domain: `Entitlements` value object with `has(key)`, `limit(key)`, `remaining(key, used)`; `canUseModule(module, permissions, entitlements, flags, appVersion)`.
`SubscriptionRepository` → `rpc get_shop_entitlements`; `ConfigRepository` → `rpc get_client_config`. Cached (FEATURE_CONFIGURATION.md §7).

UI gating uses only `canUseModule` / `Entitlements` — **no plan codes in UI code** (lint rule bans string literals of plan codes outside the subscriptions feature).

## Server
Resolution and enforcement: FEATURE_CONFIGURATION.md §4–5. Lifecycle job (pg_cron daily): `trialing → expired` at trial end,
`active → past_due` at period end without payment, `past_due → grace (7 d) → expired`. Notifications at T-7, T-1, T+0.

## Purchase flow (OD-05)
Default until decided: PlanScreen shows "Contact us / WhatsApp" and a payment-link flow handled outside the app; billing_admin
activates via admin panel (`admin_assign_plan`, `provider='manual'`) or the webhook activates automatically.

## Tests
Resolution matrix tests (plan × override × expiry × status); quota enforcement in each enforcing RPC; S-05 (client cannot write
entitlement tables); `canUseModule` table tests; lifecycle job transitions with frozen time.

## Acceptance criteria
- [ ] Changing a plan's entitlement in admin changes enforcement immediately on the server and in the app within the refresh interval.
- [ ] Expired shop can still bill; creation beyond free-tier limits blocked with upsell.
- [ ] No client path can grant an entitlement.
