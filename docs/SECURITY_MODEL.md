# Security Model

## 1. Assets and threats

| Asset | Threats | Primary controls |
|---|---|---|
| Shop financial records (sales, ledgers) | Cross-tenant read/write; tampering by staff; silent rewrite | RLS, RPC-only writes, insert-only ledgers, audit |
| Customer personal data (names, phones, balances) | Leakage to other shops, to platform staff without need | RLS, minimal admin views, scrubbed audit/logs |
| Subscription entitlements | Client self-granting | Server-side resolution and enforcement |
| Platform admin powers | Account takeover, insider misuse | MFA (aal2), role-scoped admin RPCs, audit, no generic SQL editor |
| Service-role key | Exposure → full DB bypass | Only in Edge Function secrets / CI; never in apps |
| Onboarding files (product lists, photos) | Public exposure | Private buckets, path-scoped storage policies, signed URLs |
| Device sessions | Stolen phone | SecureStore, sign-out-everywhere, device revoke, short JWT expiry |

## 2. Trust boundaries

1. **Device / browser** — untrusted. Every value it sends (shop id, role, price, discount, totals,
   entitlement) is re-validated server-side.
2. **PostgREST + PostgreSQL** — trusted enforcement point via RLS and function checks.
3. **Edge Functions** — trusted; verify the caller JWT (`supabase.auth.getUser(token)`) or the provider signature before doing anything.
4. **Admin panel server** — trusted runtime but acts **as the operator** (operator JWT), not as service role.

## 3. Authentication

| Actor | Method | Session |
|---|---|---|
| Shop users | Phone OTP (SMS provider, OD-02); email OTP in dev | Access JWT (default 1 h) + refresh token in SecureStore |
| Platform operators | Email + password + **TOTP MFA required** | Admin RPCs require `auth.jwt()->>'aal' = 'aal2'` |
| Webhooks | Provider HMAC signature | Stateless |
| Scheduled jobs | `pg_cron` → Edge Function with secret header from Vault | Stateless |

OTP abuse: Supabase rate limits + per-phone cooldown; CAPTCHA (Turnstile/hCaptcha) on admin login.

## 4. Tenant isolation (RLS)

Helper functions (`private` schema, `security definer`, `stable`, `set search_path = ''`):

```sql
private.is_member(p_shop_id uuid) returns boolean
  -- exists active shop_members row for auth.uid() and shop status <> 'closed'
private.has_permission(p_shop_id uuid, p_permission text) returns boolean
  -- member AND role_permissions(role, permission)
private.require_member(p_shop_id uuid, p_permission text default null) returns void
  -- raises DS_AUTH_REQUIRED / DS_NOT_A_MEMBER / DS_PERMISSION_DENIED / DS_SHOP_SUSPENDED
private.is_platform_admin(p_roles text[]) returns boolean
  -- active platform_admins row with role in p_roles AND aal2
```

Policy pattern per tenant table:

```sql
alter table public.products enable row level security;
create policy products_select on public.products for select to authenticated
  using ((select private.is_member(shop_id)));
create policy products_insert on public.products for insert to authenticated
  with check ((select private.has_permission(shop_id, 'product.manage')));
create policy products_update on public.products for update to authenticated
  using ((select private.has_permission(shop_id, 'product.manage')))
  with check ((select private.has_permission(shop_id, 'product.manage')));
-- no delete policy: soft delete via archived_at
```

(`(select …)` wrapping lets Postgres evaluate once per statement — Supabase performance guidance.)

Financial tables (`sales`, `sale_items`, `sale_payments`, ledgers, `stock_movements`, `purchases`, …):
**select policy only**; no insert/update/delete policies → writes are possible only via `security definer` RPCs.

Column-level protection: `revoke update (stock_on_hand_milli, balance_paise, …) on … from authenticated`.

Cashier visibility: `sales_select` policy adds `cashier_id = auth.uid() or has_permission(shop_id,'sale.view_all') or setting cashier_sees_all_sales`.

## 5. Privileged functions checklist (every `security definer` function)

1. `set search_path = ''`; all objects schema-qualified.
2. First statement checks `auth.uid()` and calls `private.require_member(...)` / `is_platform_admin(...)`.
3. Never accepts `user_id` as the acting identity; uses `auth.uid()`.
4. `revoke execute … from public, anon;` then `grant execute … to authenticated` (or `service_role` only for webhook processors).
5. Validates all inputs (types, ranges, enum values, array lengths ≤ limits).
6. Re-derives `shop_id` ownership for every referenced id (composite FKs + explicit checks).
7. Raises only `DS_*` codes; no internal details in messages.
8. Has pgTAP tests for: anon denied, non-member denied, wrong role denied, cross-shop id denied.

CI check (Phase 01): a SQL query lists `security definer` functions lacking `search_path` config or granted to `anon`/`public` → fail.

## 6. Mobile security

- Supabase session stored with an encrypted-storage adapter: a random AES key lives in `expo-secure-store`;
  the (possibly > 2 KB) session blob is encrypted and stored in AsyncStorage/SQLite. (SecureStore has value size limits.)
- Only the **anon/publishable key** ships in the app. `EXPO_PUBLIC_*` variables are public by definition; no secret uses that prefix.
- SQLite offline data: business data is not encrypted at rest in v1 (Android app sandbox). Encryption (SQLCipher) is a Phase 13 decision — see KNOWN_LIMITATIONS.md.
- Sign out: unsynced-data warning → revoke push token → clear SecureStore → wipe shop's SQLite data.
- Deep links: every route guard re-checks session + permission; server re-checks again.
- No dynamic code: remote config is data validated by Zod; never `eval`, never downloaded JS outside signed EAS Updates.
- Logs: no phone numbers, amounts linked to names, tokens, or OTPs in logs/Sentry (`beforeSend` scrubber).

## 7. Storage

| Bucket | Public | Path | Read | Write |
|---|---|---|---|---|
| `onboarding-uploads` | no | `{shop_id}/{request_id}/{file}` | shop owner, `onboarding_operator`, `super_admin` | shop owner |
| `import-files` | no | `{shop_id}/{job_id}/{file}` | `product.manage` members, operators | same |
| `expense-attachments` | no | `{shop_id}/{expense_id}/{file}` | members with `expense.view` | `expense.create` |
| `exports` | no | `{shop_id}/{export_id}.csv` | requester via signed URL (10 min) | Edge Function |
| `support-attachments` | no | `{shop_id}/{ticket_id}/{file}` | ticket participants, support roles | same |

Policies use `(storage.foldername(name))[1]::uuid` as shop id + `private.is_member`. Max file size and MIME
allow-lists per bucket (CSV/XLSX/JPEG/PNG/PDF). Files are parsed only in Edge Functions with row/size limits.

## 8. Admin panel security

- Next.js server components/actions only; Supabase calls use the operator's session cookie (`@supabase/ssr`).
- Middleware blocks non-admin users; every admin RPC re-checks role + aal2 (UI checks are convenience).
- No generic table editor, no SQL console. High-impact actions (suspend shop, change plan, kill switch) require a reason and confirmation dialog, and are audited.
- Admin views of shop data are summaries; viewing customer-level PII requires `support_agent`+ with a ticket reference (logged).
- Security headers: CSP, HSTS, frame-ancestors none, `X-Content-Type-Options`.

## 9. Secrets management

| Secret | Location |
|---|---|
| Supabase service role key | Supabase Edge Function secrets; GitHub Actions secret for migrations only |
| DB password | Password manager; GitHub Actions secret (`SUPABASE_DB_PASSWORD`) |
| Payment provider keys, webhook secret | Edge Function secrets |
| SMS provider key | Supabase Auth hook config |
| Sentry auth token | CI only |
| EAS / Play credentials | EAS secrets / EAS credentials service |

`.env*` files are git-ignored; `.env.example` lists names only.

## 10. Privacy and retention (defaults pending legal review OD-12)

- Purpose limitation: customer data is processed only on behalf of the shop (the shop is the data fiduciary for its customers; we act as processor). Terms must say this.
- Financial records: retained 8 years after creation, then archived/purged by job.
- Logs: 30 days. Audit events: 8 years. Import staging rows: 30 days. Support attachments: 1 year after ticket closure.
- Data export for a shop on request (owner): CSV export of their records.
- Breach response runbook in DEPLOYMENT_GUIDE.md §8.

## 11. Rate limiting and abuse

- Supabase Auth built-in OTP limits.
- RPC-level: `private.rate_limit(key, max, window)` backed by a small table for expensive operations (`import-preview`, `export-report`, `create_support_ticket`).
- Edge Functions: reject bodies > configured size; time-box parsing.

## 12. Required security tests (all automated, see TESTING_STRATEGY.md §5)

S-01 Shop A cannot select/insert/update Shop B rows on every tenant table (generated test over all tables).
S-02 Cashier cannot call owner-only RPCs (`adjust_customer_balance`, `update_member_role`, `update_shop_settings`, `void_sale` outside window).
S-03 Shop user cannot call any `admin_*` RPC; operator without aal2 cannot either.
S-04 Hidden module invoked directly (e.g. `get_sales_report` with advanced group-by on a plan without `reports.advanced`) → `DS_ENTITLEMENT_REQUIRED`.
S-05 Client cannot insert/update `plan_entitlements`, `shop_entitlement_overrides`, `shop_subscriptions`, `feature_flags`.
S-06 Non-member cannot read `onboarding-uploads/{other_shop}/…`; signed URL creation denied.
S-07 `security definer` functions: search_path set, no anon execute, cross-shop ids rejected.
S-08 Direct `insert into sales` / ledger tables denied for `authenticated`.
S-09 `process_verified_subscription_event` not executable by `authenticated`.
S-10 Deactivated member's existing JWT is denied on next request (membership checked per call, not from token claims).
