# Phase 12 — Dynamic Subscriptions, Plans, Feature Flags, Entitlements

Status: **Complete — awaiting approval** · Date: 2026-10-28 · Spec:
[../features/subscriptions-and-entitlements.md](../features/subscriptions-and-entitlements.md),
[../FEATURE_CONFIGURATION.md](../FEATURE_CONFIGURATION.md)

## Features implemented (end-to-end)

### 1. Plans and entitlements (admin → server → app)
- **Admin, Plans** (super_admin, billing_admin; analysts read): table of every entitlement × plan; each cell is set
  in place (`admin_set_plan_entitlement`: yes/no, a whole number or "unlimited"; type checked by the database);
  plan name (en/hi), price, period, trial days, public, status (`admin_save_plan`; `free_tier` and `free_trial`
  cannot be retired).
- **Enforcement is immediate:** every RPC resolves entitlements in its own transaction (`private.resolve_entitlements`),
  so a plan change applies to the next call. Apps see it on their next refresh (entitlements are cached with the last
  good copy for offline use).

### 2. A shop's subscription and overrides (admin, shop page)
- Subscription history; **Assign plan** (paid or trial, until a date, reason required) — the sales-assisted path
  until a payment provider is chosen (OD-05).
- **Overrides** per shop and entitlement (value, optional end date, reason); ending one is audited. The table shows
  what the shop has now and which values come from an override.
- **Flags for this shop:** on / off / follow the rollout (super_admin).

### 3. Feature flags (admin → server → app)
- **Admin, Feature flags** (super_admin; analysts read): on/off, rollout %, minimum app version, description; a
  **kill switch** button on kill-switchable flags; per-shop overrides listed; full history with **restore**.
- Evaluation (`private.flag_enabled`): disabled → off for everyone (overrides included, ADR-066); live shop override
  → its value; app older than the minimum → off; rollout bucket `hashtext(shop:key) mod 100` (stable per shop).
  `offline_sync` is not kill-switchable (refused with `DS_CONFLICT`); billing is never behind a flag.
- **App:** `get_shop_flags(shop, appVersion)`; voice billing now needs the `voice.billing` entitlement **and** the
  `voice_billing` flag.

### 4. Platform config with revisions and rollback
- **Admin, Platform config** (super_admin): each known key with help text, JSON editor, reason; the database checks
  the shape of every key (`private.check_config_value`; unknown keys refused) and refuses edits from an older
  revision (two operators at once → `DS_CONFLICT`). History per key with **restore** (a new revision; history is
  never rewritten). New keys: `support.contact`, `subscription.lifecycle`, `import.max_file_mb`.
- `get_client_config` now also returns `supportContact`.

### 5. Lifecycle job and payments
- `private.run_subscription_lifecycle` daily at 00:30 UTC (pg_cron): trial → expired at its end; active → past due
  at the period end; past due → grace after 3 days; grace → expired after 7 more (both configurable). Each change is
  audited (`subscription.status_changed`, actor `system`). Expired shops fall back to the free tier's limits;
  **billing never stops**.
- **Payment webhook** `supabase/functions/payment-webhook` (source; Razorpay format): verifies
  `X-Razorpay-Signature` (HMAC-SHA256 of the raw body, constant-time compare), maps subscription events to
  active / past due / cancelled, and calls `process_verified_subscription_event` with the service role. The event id
  is the idempotency key (`subscription_events`); the same event twice returns the first result.

### 6. App: plan screen and locked modules
- **More → Plan** (owner, manager — `subscription.view`), also from the Home plan row: plan name, status and days
  left, a warning when past due / grace / expired (billing keeps working), usage bars (items, customers, staff,
  phones), what is included, and **Message us on WhatsApp / Call us** from `support.contact`.
- **More list:** modules whose entitlement the plan lacks are shown locked ("Not in your plan · see Plan") and open
  the plan screen; modules whose flag is off are hidden (`moduleStates`, no plan codes in UI code). Suppliers is
  gated by `purchases.enabled`.

## Mobile
- **shops:** `ShopRepository.getFlags`, `GetShopFlags`, `SupabaseShopDataSource.getFlags`; Home plan row opens the plan.
- **New feature `subscription`:** `summarizePlan`, `whatsappLink`, `SupabaseConfigDataSource` (`get_client_config`),
  `usePlanViewModel`, `PlanScreen`; route `plan`.
- **shared/navigation:** `ShopAccess`, `hasEntitlement`, `flagOn`, `moduleStates`; module entries take `entitlement`
  and `flag`. **account:** `useMoreViewModel` reads access (cached, offline copy). **Container:** `getAccess`.
- **Strings:** en + hi, 722 keys each.

## Admin
Features `billing` (repository, actions, `ShopAccessSection`, value parsing), `flags` (repository, actions,
`RevisionList`, flag form), pages `/plans`, `/flags`, `/config`; shop page section *Plan, what this shop has, features
switched on*; navigation per role (billing: Plans; analyst: Plans, Flags read-only).

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261028095050_p12_subscriptions_flags` | `feature_flags` (7 seeded), `feature_flag_overrides`, `config_revisions` (seeded with current values), `subscription_events`; `private.semver_lt`, `flag_bucket`, `flag_enabled`, `assign_subscription`, `run_subscription_lifecycle`, `check_entitlement_value`, `check_config_value`, `require_reason`; `get_shop_flags`; `get_shop_entitlements` (+ plan name, product and customer usage); `get_client_config` (+ support contact); `process_verified_subscription_event` (service role only); admin RPCs for plans, entitlements, shop access, plan assignment, overrides, flags, flag overrides, config, revisions, restore — all audited; daily cron job; client write privileges on plan / subscription / config tables revoked |

## Tests executed (2026-10-28)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **543 / 543** (20 suites; subscription 7, More list per role; one udhaar screen test timed out once under parallel load and passed on rerun) |
| admin (Vitest) | **34 / 34** (entitlement values, rupees, JSON, India time, flag form and summary, modules per role) |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **433 / 433** assertions (new `019_subscriptions_flags` 47) |
| DB pgTAP on real Supabase (CI) | ✅ passed on `95b05ca` ([run 40670031769](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40670031769)) |

**Database (019):** S-05 — a shop user cannot write plan entitlements, overrides, subscriptions, flags or flag
overrides; S-09 — a signed-in user cannot apply a payment event; S-04 — an expired shop cannot open the 30-day
report; trial expiry by the job; billing without MFA and support refused; reason required; plan assignment and plan
entitlement changes enforced on the next call; invalid values refused; override limit enforced and ended; usage
counts; rollout 0 %, shop override, kill switch beats override, not-kill-switchable refused, restore from history,
minimum app version; config validation, unknown key, optimistic revision, apps receive the value; payment event
applied once; active → past due → grace → expired; 17 audited changes.
**App:** trial days, usage and limits, included features, attention states, WhatsApp link; locked / hidden modules;
plan screen; locked module opens the plan; More list per role.

Static checks: format ✅, typecheck ✅ (all workspaces), lint ✅, admin `next build` ✅ (16 routes).

## Acceptance criteria
- [x] Plan/entitlement edits enforced immediately server-side (tests 15–19).
- [x] Flags with rollout %, overrides, kill switch, revisions and rollback (tests 25–37).
- [x] Lifecycle job transitions; billing never blocked (expired shops keep billing on free-tier limits).
- [x] S-04, S-05, S-09 pass.

## Decisions (DECISIONS.md)
ADR-066 kill switch beats every override · ADR-067 history as `config_revisions`, restore = new revision, edits
guarded by expected revision · ADR-068 lifecycle durations in config; expired shops fall back to free tier, never
blocked · ADR-069 payments only through a verified webhook calling a service-role RPC; manual assignment otherwise ·
ADR-070 the app locks (not hides) modules the plan lacks and links to the plan screen; flags hide.

## Known limitations (Phase 12)
- Payment provider not chosen (OD-05): the webhook is written for Razorpay but not deployed; it needs
  `RAZORPAY_WEBHOOK_SECRET` and the shop/plan in the subscription notes. Until then billing admins assign plans.
- No in-app purchase; the plan screen sends shops to WhatsApp / phone (`support.contact` is empty until you set it).
- Renewal reminders (T-7, T-1, T+0) are not sent — notification templates are still pending (BL-1111).
- `get_client_config.flags` stays empty before sign-in; flags are evaluated per shop after sign-in.
- The blocking "please update" screen for `app.min_supported_version` is not built yet (Phase 13 hardening).
- Usage counters for monthly exports (`exports.monthly`) are not tracked yet.

## External configuration still required
Payment provider account and webhook secret (OD-05) or manual activation only; set `support.contact` in Platform
config; deploy `admin-invite-operator` (Phase 11) and, once chosen, `payment-webhook`. Otherwise unchanged.

## Recommended next phase
Phase 13 — hardening (update gate, rate limits, encryption at rest decision, observability, performance).
