# Phase 13 — Security, Accessibility, Performance, Backup and Recovery Hardening

Status: **Complete for what can be done without production access — awaiting approval** · Date: 2026-10-29 ·
Spec: [../SECURITY_MODEL.md](../SECURITY_MODEL.md), [../DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)

## What was built

### 1. One gate in front of every API call (BL-1301, BL-1306)
`public.check_request()` is PostgREST's `db_pre_request` hook (set on the `authenticator` role), so it runs before
every request in the request's own transaction:
1. **Update gate:** a phone that sends `x-ds-app-version` older than `app.min_supported_version` may only fetch the
   config and push bills it already recorded offline (`sync_push` — never lost); every other RPC →
   `DS_APP_VERSION_UNSUPPORTED`. The admin panel and Edge Functions send no version and are not gated.
2. **Maintenance write block:** with `maintenance.active` and `blocksWrites`, every RPC that is not a read
   (`get_* / list_* / search_*`, `sync_pull`) → `DS_MAINTENANCE`; `admin_*` stays open so operators can end it.
3. **Rate limits** per signed-in user (`private.rate_limit_rules`, fixed windows in `private.rate_limits`):
   create_shop 10/day, invite_shop_member 30/h, create_import_job 30/h, stage_import_rows 400/h,
   create_onboarding_request 5/day, add_onboarding_file 120/h, create_support_ticket 10/h, add_ticket_message 60/h,
   add_product_alias 300/h, begin_report_export 30/h → `DS_RATE_LIMITED` (retryable; details carry
   `retryAfterSeconds`).

Table reads (GET) return immediately. **Verified on the hosted dev API:** with the minimum raised to 9.0.0 for a
moment, `x-ds-app-version: 1.0.0` got `DS_APP_VERSION_UNSUPPORTED`; without the header the normal permission check
answered; the minimum is back at 0.0.0.

### 2. App update gate and maintenance message (mobile)
New feature `config`: the Supabase client sends `x-ds-app-version`; `AppGate` wraps the whole app and fetches
`get_client_config` on start and every `refreshSeconds`:
- **Update required** → only "Please update the app" with a Play Store button (bills saved on the phone are kept and
  sent after the update).
- **Maintenance** → banner with the operator's message (Hindi when available).
- **Update available** → dismissible hint.
- Config cannot be fetched (offline) → the app is not blocked.

### 3. Retention jobs (BL-1307)
`private.run_retention()` daily at 01:15 UTC (pg_cron): import staging rows of finished jobs after 30 days,
idempotency records after 180 days (longer than any phone stays offline), rate-limit windows after 2 days; each run
that removes records is audited (`retention.run`). Financial records and audit events are kept (8 years, OD-12).

### 4. Monitoring (BL-1308)
`admin_system_health()` (super_admin, support_agent, analyst) and a **System health** panel on the admin dashboard:
last run and status of every scheduled job (subscription lifecycle, retention), bills to review, tickets waiting
over 24 h, onboarding requests not picked up in 24 h, payment events, shops past due / in grace, users who hit a rate
limit, maintenance state. Failed or stale jobs are errors; waiting queues are warnings.

### 5. Performance (BL-1303)
- `supabase/tests/load/create-sale-load.sh` (CI `database` job, real Postgres): fills one shop with **100 000 bills
  through `create_sale`**, then times 200 more and fails unless **p95 database time < 150 ms**. The result is posted
  as a CI notice.
- Dry run in PGlite (WASM, far slower than Postgres) with 2 100 bills: p50 11 ms, p95 30 ms.
- Performance advisor on dev: only "unused index" notices (expected on an almost empty database); no missing
  foreign-key indexes. New indexes for the health and retention queries: `sales (shop_id, status)`,
  `import_jobs (status, created_at)`, `private.idempotency_keys (created_at)`.

### 6. Security review (BL-1301)
- Security advisor: `rls_enabled_no_policy` on RPC-only tables (intended: clients have no table access) and
  "security definer function executable" on our RPCs (intended: every write goes through a checked RPC). No RLS gaps;
  `process_verified_subscription_event` is not executable by anon or authenticated.
- `003_privilege_catalogue` now allow-lists `check_request` (the hook must be callable by anon and authenticated;
  it only raises or returns).
- Admin panel: added a `Content-Security-Policy` (no framing, no plugins, form posts and connections only to itself
  and Supabase) to the existing HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy headers.
- New error texts in the app and the panel for `DS_MAINTENANCE`, `DS_RATE_LIMITED` and `DS_ENTITLEMENT_REQUIRED`.

### 7. Accessibility (BL-1302)
Automated static check over every screen and component (`shared/__tests__/accessibility.test.ts`): every
`IconButton` has an `accessibilityLabel`; every `FAB` has a visible label or an `accessibilityLabel`; every
`TextInput` has a label; no touch target sets a minimum height below 48. All pass.
**Manual pass still needed on a phone:** TalkBack walk-through of billing, payment and udhaar; 200 % font scale;
contrast in bright light.

### 8. Offline data encryption decision (BL-1304) — ADR-074
Keep the phone's SQLite unencrypted in v1: Android's file-based encryption and the app sandbox protect it at rest,
the data is the shop's own, and SQLCipher would add a key to manage and a native rebuild. Revisit if a pilot shop
shares phones or the legal review (OD-12) asks for it; expo-sqlite's SQLCipher option is the path.

### 9. Backups and recovery (BL-1305)
Needs the Supabase paid plan (PITR). The runbook is in [../DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) §7 with the
restore-drill steps and what to time; the drill itself is a Phase 14 task once production exists.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261028103936_p13_hardening` | `private.rate_limits`, `private.rate_limit_rules`, `private.rate_limit`, `private.is_read_rpc`, `public.check_request` (+ `pgrst.db_pre_request` on `authenticator`), `private.run_retention` (+ daily cron), `public.admin_system_health`, three indexes |

## Tests executed (2026-10-29)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **552 / 552** (22 suites; config gate 5, static accessibility 4) |
| admin (Vitest) | **37 / 37** (+ system-health alerts) |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **449 / 449** assertions (new `020_hardening` 16) |
| DB pgTAP, concurrency and load on real Supabase (CI) | ✅ passed on `706f990` ([run 40853469311](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40853469311)) |

**Database (020):** old app refused, config and offline push still allowed, minimum version passes, no header not
gated; maintenance blocks writes, keeps reads and admin open, ignores GET; ten tickets an hour allowed, the eleventh
refused, limits per user; operators see the limit hit, shop users cannot read health; retention removes old
idempotency records and keeps recent ones.
**App:** update required / available / maintenance states; update screen blocks the app and opens the Play Store;
maintenance banner; no block when offline; static accessibility checks.

Static checks: format ✅, typecheck ✅ (all workspaces), lint ✅, admin `next build` ✅.

## Acceptance criteria
- [x] Supabase security & performance advisors clean or justified (above).
- [~] Accessibility pass — automated checks pass; the TalkBack / font-scale / contrast pass needs a phone.
- [x] Load test: create_sale p95 < 150 ms DB time at 100k sales/shop — the check runs in CI on every push
  — **met: p50 1.0 ms, p95 1.1 ms, max 14.3 ms with 100 200 bills in one shop** (CI run 40853469311).
- [ ] PITR enabled; restore drill documented with timings — needs the paid plan and production (Phase 14).

## Decisions (DECISIONS.md)
ADR-071 one pre-request hook for update gate, maintenance and rate limits · ADR-072 version gate exempts config and
`sync_push` · ADR-073 retention periods · ADR-074 SQLite stays unencrypted in v1 · ADR-075 load check in CI.

## Known limitations (Phase 13)
- PITR and the restore drill need the paid plan and production (Phase 14).
- Accessibility on a real phone (TalkBack, font scale, contrast) not yet checked.
- Alerts are shown in the admin dashboard; no email / Slack push yet (needs a destination and Sentry DSN).
- Rate limits are per user, not per IP (Supabase Auth limits OTP sends separately).
- The CSP does not restrict scripts (Next.js inline bootstrap would need nonces on every page).

## External configuration still required
Supabase paid plan with PITR (production); Sentry DSN and an alert destination; a phone for the accessibility pass;
otherwise unchanged (payment provider, invite / webhook deploys, email template, SMS provider, dev build, printers).

## Recommended next phase
Phase 14 — regression, release and pilot (production project, PITR, restore drill, Play Store internal track).
