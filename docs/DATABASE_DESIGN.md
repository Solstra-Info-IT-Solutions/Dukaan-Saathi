# Database Design

PostgreSQL (Supabase) is the **authoritative store** for all synchronized business data. SQL migrations in
`supabase/migrations` are the only way the schema changes. Diagrams: [DATABASE_ERD.md](DATABASE_ERD.md).
Columns: [DATABASE_DATA_DICTIONARY.md](DATABASE_DATA_DICTIONARY.md).

## 1. Schemas

| Schema | Exposed via PostgREST | Contents |
|---|---|---|
| `public` | yes | Tenant tables (RLS on every table), client-callable RPCs, admin RPCs |
| `private` | **no** | Helper functions (`require_member`, `has_permission`, money math, `assert_entitlement`), `idempotency_keys`, internal queues |
| `audit` | **no** | `audit.events` append-only log; read through `admin_list_audit_log` / `list_shop_audit` RPCs |
| `storage` | Supabase-managed | Buckets with policies (SECURITY_MODEL.md §7) |

## 2. Table groups

| Group | Tables | Phase |
|---|---|---|
| Identity & tenancy | `profiles`, `shops`, `shop_settings`, `shop_members`, `shop_invitations`, `shop_devices`, `role_permissions` | 02 |
| Platform admin | `platform_admins` | 02 (table), 11 (UI) |
| Configuration | `entitlement_definitions`, `subscription_plans`, `plan_entitlements`, `shop_subscriptions`, `shop_entitlement_overrides`, `feature_flags`, `feature_flag_overrides`, `platform_config`, `config_revisions`, `content_blocks`, `announcements`, `tax_rates`, `units` | 02 (seed/basic), 12 (full) |
| Catalogue | `categories`, `products`, `product_barcodes`, `product_aliases`, `product_price_history` | 03 |
| Imports & onboarding | `import_jobs`, `import_job_rows`, `onboarding_requests` | 03 / 11 |
| Sales | `invoice_series`, `sales`, `sale_items`, `sale_payments`, `sale_returns`, `sale_return_items` | 04–06 |
| Expenses & day close | `expense_categories`, `expenses`, `day_closures` | 06 |
| Inventory | `stock_movements` | 07 |
| Suppliers & purchases | `suppliers`, `supplier_ledger_entries`, `purchases`, `purchase_items` | 07 |
| Customers & udhaar | `customers`, `customer_ledger_entries` | 08 |
| Sync | `sync_batches`, `sync_operation_results` | 09 |
| Notifications | `push_tokens`, `notifications`, `notification_templates` | 06 / 11 |
| Support | `support_tickets`, `support_ticket_messages` | 11 |
| Billing events | `subscription_events` | 12 |
| Usage | `usage_counters` | 12 |
| Audit | `audit.events` | 02 |

## 3. Tenant key and indexing rules

- Every tenant table has `shop_id uuid not null references shops(id)`.
- Child tables repeat `shop_id` (e.g. `sale_items.shop_id`) so RLS is a single indexed predicate and
  composite foreign keys `(shop_id, sale_id) → sales(shop_id, id)` make cross-tenant references impossible.
- Every tenant table has an index starting with `shop_id` matching its main list query
  (e.g. `sales (shop_id, business_date desc, id desc)`).
- Search: `pg_trgm` GIN index on `products.search_text` (name + aliases + normalized transliteration).

## 4. Money, quantity, percentages

| Kind | Column type | Unit | Example |
|---|---|---|---|
| Money | `bigint` | paise | ₹12.50 → `1250` |
| Quantity | `bigint` | milli-units | 1.25 kg → `1250`; 3 pieces → `3000` |
| Percent / tax rate | `integer` | basis points (1 % = 100 bp) | 18 % → `1800` |

- Check constraints: `>= 0` for prices and amounts; quantities `> 0` on sale lines.
- SQL functions in `private` mirror `packages/domain-core`:
  `private.line_amount(price_paise, qty_milli)`, `private.round_half_up_div(numer, denom)`,
  `private.tax_from_inclusive(amount_paise, rate_bp)`. A shared fixture file
  (`packages/domain-core/fixtures/money-cases.json`) is executed by both Jest and pgTAP so they cannot drift.
- Rounding: half away from zero, to whole paise, per line. Bill-level round-off to the nearest rupee is
  optional (`shop_settings.round_off_enabled`) and stored as an explicit `round_off_paise` (can be negative).

## 5. Tax

- `tax_rates` (platform-managed): `code`, `rate_bp`, `label`, `effective_from`, `effective_to`. GST slabs change
  over time, so products reference a rate **code**; the **rate is snapshotted** on each `sale_items` row.
- `shop_settings.tax_mode`: `none` (default) | `gst_regular` | `gst_composition`.
  - `none`: no tax lines, "Bill / Cash memo" heading.
  - `gst_regular`: tax-inclusive prices, back-calculated tax per line, CGST/SGST split on receipt, GSTIN printed, HSN if set.
  - `gst_composition`: "Bill of supply", no tax collected on receipt.
- IGST / inter-state and e-invoicing are out of scope (KNOWN_LIMITATIONS.md).

## 6. Invoice numbering (ADR-008)

- `invoice_series (shop_id, device_id, fy, last_seq, prefix)` — one row per device per financial year.
- The device keeps its own counter (in SQLite from Phase 09; in SecureStore/memory before) and sends `{fy, seq}`.
- `sales` has `unique (shop_id, device_id, fy, seq)`. `create_sale` also updates `invoice_series.last_seq = greatest(last_seq, seq)`
  and records gaps (`seq > last_seq + 1`) as a `needs_review` reason.
- `register_device` returns `last_seq` for the current FY so a device that re-registers (same device id) continues correctly.
  A reinstalled app registers as a **new** device code — no collision possible.
- Display format: `{prefix}/{fy}/{device_code}-{seq:06}`; `prefix` default `DS`, set in shop settings.
- FY string: `"2627"` = 1 Apr 2026 – 31 Mar 2027, computed from `occurred_at` in shop time zone.

## 7. Transactions and concurrency

| Operation | Locks | Isolation notes |
|---|---|---|
| `create_sale` | `products … for share` (prices/flags stable), `customers … for update` if udhaar | Unique constraint on invoice seq resolves concurrent duplicates |
| `void_sale` | `sales … for update` | Status check after lock |
| `record_customer_repayment` / `adjust_customer_balance` | `customers … for update` | Balance = previous + delta |
| `adjust_stock`, `receive_purchase` | `products … for update` | `stock_on_hand_milli` updated in place |
| `commit_product_import` | `import_jobs … for update` | Job status `committing → committed` prevents double commit |
| `process_verified_subscription_event` | `shop_subscriptions … for update` | Event id unique |

All run in the default `read committed` level with explicit row locks — enough because every invariant is
tied to a locked row or a unique constraint. Each RPC is a single statement from the client's point of
view, so the whole function body is one transaction.

## 8. Ledgers and projections

| Ledger | Projection | Rebuild function |
|---|---|---|
| `stock_movements` | `products.stock_on_hand_milli` | `private.rebuild_stock(shop_id, product_id)` |
| `customer_ledger_entries` | `customers.balance_paise`, `customers.last_activity_at` | `private.rebuild_customer_balance(shop_id, customer_id)` |
| `supplier_ledger_entries` | `suppliers.balance_paise` | `private.rebuild_supplier_balance(shop_id, supplier_id)` |

- Ledger rows are insert-only (no `update`/`delete` grants to `authenticated`; enforced additionally by trigger).
- Signed amounts: customer ledger `amount_paise > 0` = customer owes more (debit), `< 0` = paid/reduced.
- A nightly job compares projections with ledger sums and reports drift to Sentry (Phase 13).

## 9. Historical snapshots

`sale_items` stores `product_name`, `unit_code`, `unit_price_paise`, `tax_rate_bp`, `hsn_code`,
`cost_price_paise` at the time of sale. `sales` stores `shop_name_snapshot`, `gstin_snapshot`, and customer
name/phone snapshots for the receipt. Editing a product or shop never changes past receipts.

## 10. Deletion and retention

- Financial tables (`sales`, `sale_*`, ledgers, `stock_movements`, `purchases`, `expenses`, `day_closures`):
  never deleted by app users. Corrections are voids/returns/adjustments.
- Master data (`products`, `categories`, `customers`, `suppliers`): soft delete via `archived_at`.
- `import_job_rows`: deleted 30 days after job completion (pg_cron).
- Shop closure: shop `status='closed'`; data retained per retention policy (default 8 years for financial
  records, aligning with typical Indian accounting record-keeping; to be confirmed by legal review OD-12),
  personal data of customers anonymised on verified owner request where law allows.

## 11. Migrations

- File naming: `YYYYMMDDHHMMSS_<phase>_<description>.sql`, e.g. `20261101090000_p02_tenancy.sql`.
- Each migration: schema change + RLS policies + grants + comments in the same file.
- Never edit a migration that has run in staging/production; add a new one.
- Generated types: `supabase gen types typescript` → `packages/contracts/src/database.types.ts` (CI checks it is current).

## 12. Default privileges

```sql
-- Applied in the first migration
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
-- Then grant per table / per function explicitly to authenticated.
```
