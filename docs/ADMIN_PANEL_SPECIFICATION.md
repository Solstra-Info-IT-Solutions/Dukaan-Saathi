# Admin Panel Specification

Separate Next.js app (`apps/admin`) for **platform operators only**. Shop owners never use it.

## 1. Architecture

```
apps/admin/src/features/<module>/
  presentation/   page sections (client components), useXxxViewModel hooks (TanStack Query + server actions)
  domain/         types, validation (Zod from @ds/contracts), permission helpers
  data/           server-only repositories → supabase.rpc('admin_*')
app/(admin)/<module>/page.tsx   server component: requireOperator(role[]) + initial data
```

- Auth: `@supabase/ssr` cookie session; middleware redirects unauthenticated or non-operator users; MFA enrolment forced at first login; every page and server action calls `requireOperator(['super_admin', …])`.
- All writes are **server actions → admin RPCs**. No Supabase calls from the browser except auth.
- Lists: server-side pagination, filters in URL search params (shareable, back-button friendly).
- Every mutating action: Zod validation → confirmation for high impact → RPC → toast → audit link.

## 2. Modules

| Module | Roles | Key screens | Actions |
|---|---|---|---|
| Dashboard | all | KPIs: active shops (7/30 d), new shops, trials ending, past-due, sales volume (aggregate), sync failure rate, open tickets, onboarding backlog | — |
| Shops | all (detail per matrix) | List (search, plan, status, city, created), detail tabs: overview, members, devices, subscription, usage, onboarding, tickets, audit | suspend/reactivate (reason), assign plan, entitlement override, revoke device, resend invitation |
| Users & memberships | super_admin, support_agent | Search by phone (masked), memberships | replace lost owner (verification checklist + reason), deactivate member |
| Onboarding | super_admin, onboarding_operator | Queue (kanban by status), request detail with attachments (signed URLs) | assign, change status, create import job for shop, message owner |
| Import jobs | super_admin, onboarding_operator | Job list, row review grid with errors, inline edit | edit rows, re-validate, submit for owner approval, cancel (commit requires owner approval in app, or operator commit if owner granted consent on the request) |
| Plans | super_admin, billing_admin | Plan list, plan editor (name, price, period, trial days, status), entitlement grid | create draft, edit, publish (new revision), retire |
| Entitlements | super_admin, billing_admin | Definition list (read-only keys from code), per-shop overrides | add/expire override (reason, expiry) |
| Subscriptions | super_admin, billing_admin | Shop subscription history, provider events | manual activation (offline payment) with reference, extend trial, cancel |
| Feature flags | super_admin | Flag list, rollout %, overrides, history | toggle, set rollout, kill switch (double confirm), shop override |
| Platform settings | super_admin | Config keys with schema-driven forms, revision history, diff | update, restore revision |
| Catalogue references | super_admin | Tax rates, units, business categories | add/expire rate (effective dates), add unit |
| Content | super_admin, support_agent | Help articles, onboarding tips, notification templates, announcements | create, edit, publish/unpublish, preview per locale |
| Support | super_admin, support_agent, + scoped | Ticket queue, ticket thread, internal notes | assign, reply, change status/priority |
| Audit log | super_admin (all), others own module | Filterable log (actor, shop, action, date) | export (super_admin) |
| Operators | super_admin | Operator list | invite (Edge `admin-invite-operator`), change role, disable |
| Monitoring | super_admin | Sync rejections/quarantine, `needs_review` rate, error-code trends, cron job status | links to Sentry/Supabase dashboards |

## 3. High-impact actions (confirmation + reason + audit)

Suspend shop · assign/cancel plan · entitlement override · kill switch / flag change · platform config change ·
replace owner · disable operator · restore config revision · publish critical announcement.

## 4. Admin RPC catalogue

| RPC | Roles | Audit action |
|---|---|---|
| `admin_dashboard_metrics(p_range)` | all | — |
| `admin_list_shops(p_filter, p_cursor, p_limit)` | all | — |
| `admin_get_shop(p_shop_id)` | per matrix | `admin.shop_viewed` (for PII views) |
| `admin_set_shop_status(p_shop_id, p_status, p_reason)` | super_admin, billing_admin | `admin.shop_status_changed` |
| `admin_replace_owner(p_shop_id, p_new_owner_phone, p_reason, p_verification)` | super_admin, support_agent | `admin.owner_replaced` |
| `admin_assign_plan(p_shop_id, p_plan_code, p_period_end, p_reference, p_reason)` | super_admin, billing_admin | `admin.plan_assigned` |
| `admin_set_entitlement_override(p_shop_id, p_key, p_value, p_expires_at, p_reason)` | super_admin, billing_admin | `admin.entitlement_override` |
| `admin_upsert_plan(p_plan)`, `admin_set_plan_entitlements(p_plan_id, p_values)`, `admin_publish_plan(p_plan_id)` | super_admin, billing_admin | `admin.plan_changed` |
| `admin_upsert_feature_flag(p_flag)`, `admin_set_flag_override(p_key, p_shop_id, p_enabled, p_expires_at, p_reason)` | super_admin | `admin.flag_changed` |
| `admin_update_platform_config(p_key, p_value, p_expected_revision, p_reason)` | super_admin | `admin.config_changed` |
| `admin_restore_config_revision(p_entity, p_key, p_revision, p_reason)` | super_admin | `admin.config_restored` |
| `admin_upsert_content(p_block)`, `admin_publish_announcement(p_announcement)` | per matrix | `admin.content_changed` |
| `admin_list_onboarding(p_filter)`, `admin_update_onboarding(p_id, p_patch)` | super_admin, onboarding_operator | `admin.onboarding_updated` |
| `admin_create_import_job(p_shop_id, p_onboarding_id, p_storage_path)` | super_admin, onboarding_operator | `admin.import_created` |
| `admin_list_tickets`, `admin_update_ticket`, `admin_reply_ticket` | support roles | `admin.ticket_updated` |
| `admin_list_audit_log(p_filter, p_cursor)` | per matrix | — |
| `admin_set_operator_role(p_user_id, p_role, p_status)` | super_admin | `admin.operator_changed` |

All: `security definer`, `search_path=''`, `private.require_platform_role(roles)` (checks aal2), optimistic
concurrency via `p_expected_revision` for config edits.

## 5. Explicitly not built

Generic table editor · SQL console · editing/deleting sales, ledgers, stock movements · impersonating a shop user.
(Diagnostics use read-only views; a future "view as shop" must be read-only and audited — not in v1.)
