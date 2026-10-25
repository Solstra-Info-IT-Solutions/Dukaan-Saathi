# API, RPC and Data-Access Contracts

Status: design (Phase 00). Every operation below gets a Zod schema in `packages/contracts` and a test in
`supabase/tests` when implemented. Names are final unless a phase document records a change.

## 1. Access types

| Type | Used for | Auth | Transaction |
|---|---|---|---|
| **T** — Table access via PostgREST | Single-table CRUD on master data (categories, products, suppliers, expense categories, settings reads) | User JWT, RLS | Single statement; triggers enforce quotas/history |
| **R** — PostgreSQL RPC (`public` schema function) | Any multi-table write, any financial write, aggregated reads | User JWT; function checks membership/permission/entitlement | One transaction per call |
| **A** — Admin RPC (`public.admin_*`) | Platform operations | Operator JWT with `aal2`; checks `platform_admins` role | One transaction; writes audit |
| **E** — Edge Function | Secrets, third-party APIs, file parsing, webhooks, push sending | User JWT verified in function, or provider signature | Calls RPCs (service role only where documented) |
| **L** — Local (SQLite) | Offline cache and outbox | Device | SQLite transaction |

## 2. Error contract

SQL functions raise `raise exception '<CODE>' using errcode = 'P0001', detail = '<json>'`.
Edge Functions return `{ "error": { "code": "<CODE>", "details": {…} } }` with an HTTP status.
The client translates both (REPOSITORY_PATTERN.md §6) to `AppError`.

| Code | HTTP (edge) | Meaning | Retryable |
|---|---|---|---|
| `DS_AUTH_REQUIRED` | 401 | No/expired session | after re-login |
| `DS_MFA_REQUIRED` | 403 | Admin op without `aal2` | after MFA |
| `DS_NOT_A_MEMBER` | 403 | User is not an active member of the shop | no |
| `DS_PERMISSION_DENIED` | 403 | Role lacks permission | no |
| `DS_SHOP_SUSPENDED` | 403 | Shop suspended by platform | no |
| `DS_ENTITLEMENT_REQUIRED` | 402 | Plan does not include the feature | no |
| `DS_QUOTA_EXCEEDED` | 402 | Plan limit reached (details: key, limit, used) | no |
| `DS_FEATURE_DISABLED` | 403 | Feature flag off (kill switch) | later |
| `DS_VALIDATION_FAILED` | 422 | Input invalid (details: field errors) | no |
| `DS_IDEMPOTENCY_CONFLICT` | 409 | Same `client_operation_id`, different payload | no |
| `DS_TOTAL_MISMATCH` | 409 | Client totals ≠ server totals (online) | no — refresh prices |
| `DS_PRODUCT_INACTIVE` | 409 | Product deleted/inactive (online) | no |
| `DS_INSUFFICIENT_STOCK` | 409 | Negative stock blocked by setting | no |
| `DS_CUSTOMER_REQUIRED` | 422 | Udhaar without customer | no |
| `DS_CREDIT_LIMIT_EXCEEDED` | 409 | Credit limit policy = block | no |
| `DS_DISCOUNT_LIMIT_EXCEEDED` | 403 | Discount above role limit | no |
| `DS_PRICE_OVERRIDE_DENIED` | 403 | Price override not allowed | no |
| `DS_SALE_ALREADY_VOIDED` | 409 | | no |
| `DS_VOID_WINDOW_EXPIRED` | 403 | | no |
| `DS_DEVICE_NOT_REGISTERED` | 403 | Device unknown/revoked | after re-register |
| `DS_INVOICE_SEQUENCE_CONFLICT` | 409 | Invoice number already used by another operation | no — device must re-register series |
| `DS_APP_VERSION_UNSUPPORTED` | 426 | Below `min_supported_app_version` | after update |
| `DS_CONFIG_INVALID` | 500 | Stored config fails schema | no |
| `DS_RATE_LIMITED` | 429 | | yes, with backoff |
| `DS_NOT_FOUND` | 404 | | no |
| `DS_CONFLICT` | 409 | Generic uniqueness conflict (e.g. barcode already used) | no |
| `DS_INTERNAL` | 500 | Unexpected | yes, limited |
| `NETWORK_OFFLINE` / `NETWORK_TIMEOUT` | — | client-only | yes |

## 3. Common input fields

| Field | Type | Rule |
|---|---|---|
| `shop_id` | uuid | Must be a shop where `auth.uid()` is an active member. Never trusted alone. |
| `device_id` | uuid | Must be an active device of that shop registered by a member. |
| `client_operation_id` | uuid (v7) | Required on every financial write. Unique per shop. |
| `occurred_at` | timestamptz | Device time; accepted within [now − 30 days, now + 10 min]; outside → `needs_review` (offline) or `DS_VALIDATION_FAILED` (online). |
| `app_version` | string semver | Sent as header `x-ds-app-version`; checked by `private.assert_app_version()` on writes. |

**Idempotency contract (all financial writes)**: the server stores `(shop_id, client_operation_id,
operation, request_hash, result)` in `private.idempotency_keys` inside the same transaction. A repeat
with the same hash returns the stored result; a different hash raises `DS_IDEMPOTENCY_CONFLICT`. Retries
are therefore safe and the client must retry with the same id.

## 4. Operation catalogue

Legend: Ph = phase; Idem = idempotent via client_operation_id.

| Operation | Type | Feature | Ph | Caller / permission | Idem | Notes |
|---|---|---|---|---|---|---|
| `get_my_context()` | R | auth | 02 | authenticated | — | Profile, memberships, pending invitations |
| `create_shop(p_input)` | R | shops | 02 | authenticated | yes | Creates shop, owner membership, settings, trial subscription, default categories |
| `update_shop_settings(p_shop_id, p_patch)` | R | settings | 02 | `settings.manage` | — | Validates against settings schema version; audits |
| `update_my_profile(p_patch)` | R | auth | 02 | authenticated | — | `displayName`, `preferredLanguage` only |
| `get_shop_settings(p_shop_id)` | R | settings | 02 | member | — | Shop profile + settings, camelCase |
| `update_shop_profile(p_shop_id, p_patch)` | R | settings | 02 | `settings.manage` | — | name, category, phone, address; audited |
| `invite_shop_member(p_shop_id, p_role, p_phone?, p_email?)` | R | memberships | 02 | `staff.manage` | — | Quota `staff_accounts.max` (active non-owners + pending invites); re-inviting refreshes the pending row |
| `accept_shop_invitation(p_invitation_id)` | R | memberships | 02 | invited user (verified phone or email match) | — | Not-yours and not-found both return `DS_NOT_FOUND` |
| `revoke_shop_invitation(p_invitation_id)` | R | memberships | 02 | `staff.manage` | — | |
| `list_shop_members(p_shop_id)` | R | memberships | 02 | member | — | Contacts and deactivated members only for `staff.manage` |
| `update_member_role(p_shop_id, p_user_id, p_role)` | R | memberships | 02 | `staff.manage` | — | Cannot remove last owner |
| `deactivate_member(p_shop_id, p_user_id)` | R | memberships | 02 | `staff.manage` | — | Revokes their devices |
| `register_device(p_shop_id, p_installation_id, p_platform, p_label?, p_app_version?)` | R | devices | 02 | member | per installation | Returns `deviceId`, `deviceCode`, `invoicePrefix`, `fy`, `lastSeq`; quota `devices.max`; revoked installation → `DS_DEVICE_NOT_REGISTERED` |
| `revoke_device(p_shop_id, p_device_id)` | R | devices | 02 | `staff.manage` | — | |
| `units`, `tax_rates`, `categories`, `products`, `product_barcodes`, `product_aliases` | T (read only) | catalogue | 03 | member (RLS) | — | `products.last_cost_paise` has no client column grant; no client writes on any catalogue table (ADR-030) |
| `product_price_history`, `import_jobs`, `import_job_rows` | T (read only) | catalogue | 03 | `product.manage` (RLS) | — | Import screen reads problem rows directly |
| `get_catalogue_reference(p_shop_id)` | R | catalogue | 03 | member | — | `{ units, taxRates, categories }` |
| `save_category(p_shop_id, p_id?, p_name, p_name_hi?)` | R | catalogue | 03 | `product.manage` | by id | Name unique per shop (case-insensitive) → `DS_CONFLICT`; returns `{ id }` |
| `archive_category(p_shop_id, p_id)` | R | catalogue | 03 | `product.manage` | — | Soft delete; its products become uncategorised |
| `save_product(p_shop_id, p_input)` | R | catalogue | 03 | `product.manage` | by client id (ADR-031) | Full replace incl. barcodes/aliases; triggers: quota `products.max`, price history, `search_text`; barcode taken → `DS_CONFLICT`; returns Product |
| `archive_product(p_shop_id, p_product_id)` | R | catalogue | 03 | `product.manage` | — | Soft delete |
| `get_product(p_shop_id, p_product_id)` | R | catalogue | 03 | member | — | Cost masked without `product.view_cost` |
| `search_products(p_shop_id, p_query?, p_category_id?, p_limit, p_offset)` | R | catalogue | 03 | member | — | Name / Hindi / alias / barcode, trigram; returns `{ items, nextOffset }`; cost masked without `product.view_cost` |
| `create_import_job(p_shop_id, p_file_name, p_client_operation_id)` | R | imports | 03 | `product.manage`, entitlement `catalogue.import` | yes | Returns ImportJobSummary |
| `stage_import_rows(p_job_id, p_rows)` | R | imports | 03 | `product.manage` | — | Batches (client sends 500); server validates each row; limit `import.rows_per_job` → `DS_QUOTA_EXCEEDED` |
| `update_import_row(p_row_id, p_patch, p_skip?)` | R | imports | 03 | `product.manage` | — | Fix fields or skip; revalidates; returns ImportJobSummary |
| `cancel_import_job(p_job_id)` | R | imports | 03 | `product.manage` | — | |
| `commit_product_import(p_job_id, p_client_operation_id)` | R | imports | 03 | `product.manage`, entitlement `catalogue.import` | yes | All-or-nothing create/update; refused while errors remain; quota re-checked; returns `{ jobId, created, updated, replayed? }` |
| `import-preview` | E | imports | 11 | operator / `product.manage` | — | XLSX parsing for the admin workbench (ADR-032); CSV is parsed on the phone |
| `create_sale(p_input)` | R | billing | 04–05 | `sale.create` (+ `sale.discount`, `sale.price_override`, `udhaar.grant` as needed) | yes | See §5.1. Covers logical `create_quick_sale` and `complete_product_sale` |
| `void_sale(p_input)` | R | billing | 05 | `sale.void` within window; owner always | yes | Reverses stock + ledger; audits |
| `create_sale_return(p_input)` | R | billing | 06 | `sale.return` | yes | Partial returns, refund method, stock back |
| `get_sale(p_shop_id, p_sale_id)` | R | billing | 04 | member (cashier: own sales only unless `cashierSeesAllSales` or `sale.view_all`) | — | Receipt data: totals, lines, payments, shop header; other users' bills → `DS_NOT_FOUND` |
| `sales`, `sale_items`, `sale_payments` | T (read only) | billing | 04 | `rls.can_view_sale` | — | No client writes; only `create_sale` inserts |
| `list_sales(p_shop_id, p_filter, p_cursor, p_limit)` | R | billing | 05 | member (cashier scope) | — | Keyset pagination |
| `get_dashboard_snapshot(p_shop_id, p_business_date)` | R | reports | 06 | `report.view_sales` | — | Today totals, split, udhaar given/collected |
| `get_sales_report(p_shop_id, p_from, p_to, p_group_by)` | R | reports | 06 | `report.view_sales`; profit fields need `report.view_profit` | — | Entitlement `reports.advanced` for > 7 days / group-by product |
| `export-report` | E | reports | 06 | `report.export`, entitlement `reports.export` | — | CSV/PDF to private bucket, signed URL |
| `record_expense(p_input)` | R | expenses | 06 | `expense.create` | yes | |
| `close_day(p_input)` | R | reports | 06 | `day.close` | yes | Stores expected vs counted cash |
| `adjust_stock(p_input)` | R | inventory | 07 | `stock.adjust` | yes | Movement + projection; audits |
| `submit_stock_count(p_input)` | R | inventory | 07 | `stock.adjust` | yes | Many adjustments in one txn |
| `suppliers` | T | purchases | 07 | read: `purchase.view`; write: `purchase.manage` | — | Opening balance via RPC below |
| `create_supplier(p_input)` | R | purchases | 07 | `purchase.manage` | yes | Supplier + opening balance ledger entry |
| `receive_purchase(p_input)` | R | purchases | 07 | `purchase.receive` | yes | Purchase + items + stock movements + cost update + supplier ledger + payments |
| `record_supplier_payment(p_input)` | R | purchases | 07 | `purchase.pay` | yes | |
| `create_customer(p_input)` | R | customers | 08 | `customer.manage` (cashier: quick-create allowed) | yes | Customer + opening balance entry |
| `customers` (update name/phone/notes) | T | customers | 08 | `customer.manage` | — | Balance columns not writable (column grants) |
| `record_customer_repayment(p_input)` | R | udhaar | 08 | `udhaar.collect` | yes | Ledger credit entry; payment method |
| `adjust_customer_balance(p_input)` | R | udhaar | 08 | `udhaar.adjust` (owner) | yes | Reason required; audits |
| `get_customer_ledger(p_shop_id, p_customer_id, p_cursor, p_limit)` | R | udhaar | 08 | `customer.view` | — | Running balance |
| `list_udhaar(p_shop_id, p_sort, p_cursor, p_limit)` | R | udhaar | 08 | `customer.view` | — | Balances > 0 |
| `sync_push(p_input)` | R | offline-sync | 09 | member + device | per-op | Batch of outbox ops; per-op result; see OFFLINE_SYNC_DESIGN.md |
| `sync_pull(p_shop_id, p_device_id, p_cursors)` | R | offline-sync | 09 | member + device | — | Changed catalogue/customers/settings since cursor, tombstones |
| `voice-parse` *(optional, flag `voice.cloud_parse`)* | E | voice-billing | 10 | `sale.create`, entitlement `voice.billing` | — | Only if deterministic parser insufficient (ADR-017) |
| `create_onboarding_request(p_input)` | R | onboarding | 11 | owner | yes | Upload paths in private bucket |
| `create_support_ticket(p_input)` / `add_ticket_message(p_input)` | R | support | 11 | member | yes | |
| `register_push_token(p_input)` | R | notifications | 06 | member + device | — | |
| `get_client_config(p_shop_id, p_app_version, p_platform)` | R | config | 02 (basic), 12 (full) | authenticated | — | Platform config, flags, announcements, content, revision |
| `get_shop_entitlements(p_shop_id)` | R | subscriptions | 02 (basic), 12 | member | — | Resolved map + revision + plan + status |
| `payments-webhook` | E | subscriptions | 12 | payment provider (signature) | provider event id | Verifies signature then calls `process_verified_subscription_event` with service role |
| `process_verified_subscription_event(p_event)` | R | subscriptions | 12 | **service_role only** | event id | Updates `shop_subscriptions`; audits |
| `send-notifications` | E | notifications | 06/11 | pg_cron (secret header) | job id | Digests, reminders, announcements |
| `admin_*` | A | admin | 11–12 | platform roles | — | See ADMIN_PANEL_SPECIFICATION.md §4 |
| `admin-invite-operator` | E | admin | 11 | `super_admin` | — | Uses service role to create auth user + invite |

## 5. Detailed contracts (core financial operations)

### 5.1 `create_sale`

> **As built in Phase 04 (ADR-037):** keys are camelCase (`clientOperationId`, `shopId`, `deviceId`, `invoice {fy, seq}`,
> `occurredAt`, `origin: "online"`, `source`, `lines[{kind:"quick", label?, amountPaise}]`, `billDiscountPaise?`,
> `payments[{method, amountPaise, reference?}]` (≤ 10), `clientTotals`, `note?`); see `CreateSaleInputSchema` in
> `@ds/contracts`. Output `{ saleId, invoiceNumber, seq, status, reviewReasons, totals, replayed }`. Only `last_seq + 1` is
> accepted as `invoice.seq` (`DS_INVOICE_SEQUENCE_CONFLICT` carries `expectedSeq`). Product lines (Phase 05), udhaar and
> customers (Phase 08) and `offline_sync` (Phase 09) are refused with `DS_VALIDATION_FAILED` until then. The full design below
> remains the target.

**Input** (`CreateSaleInputSchema`):

```ts
{
  client_operation_id: uuid,
  shop_id: uuid,
  device_id: uuid,
  invoice: { fy: "2627", seq: number /* > 0 */ },
  occurred_at: iso8601,
  origin: "online" | "offline_sync",
  customer_id?: uuid | null,
  lines: Array<
    | { kind: "product", line_id: uuid, product_id: uuid, quantity_milli: int > 0,
        unit_price_paise: int >= 0, line_discount_paise?: int >= 0, entry_mode?: "quantity" | "amount" }
    | { kind: "quick", line_id: uuid, label?: string(<=60), amount_paise: int > 0 }
  >,            // 1..200 lines
  bill_discount_paise?: int >= 0,
  payments: Array<{ method: "cash" | "upi" | "card" | "other", amount_paise: int > 0, reference?: string(<=40) }>,
  udhaar_paise?: int >= 0,          // requires customer_id
  client_totals: { subtotal_paise, discount_paise, tax_paise, round_off_paise, total_paise },
  note?: string(<=200),
  source?: "keypad" | "search" | "scan" | "voice"
}
```

**Output** (`CreateSaleOutputSchema`): `{ sale_id, invoice_number, status: "completed" | "needs_review",
review_reasons: string[], totals: {…server totals…}, customer_balance_paise?: int, replayed: boolean }`.

**Server steps (one transaction)**:
1. `private.require_member(shop_id, 'sale.create')`; shop not suspended; device belongs to shop and active; app version supported.
2. Idempotency lookup → replay or conflict.
3. Lock product rows used (`for share`) and load current price, tax rate, cost, stock flag.
4. Price policy: `unit_price_paise` ≠ current price → allowed if user has `sale.price_override` **and** setting allows; else online → `DS_TOTAL_MISMATCH`; offline_sync → accept if price matches a `product_price_history` value effective at `occurred_at`, otherwise accept + `needs_review('price_changed')`.
5. Discount policy against role limit (`DS_DISCOUNT_LIMIT_EXCEEDED` online; `needs_review` offline).
6. Compute totals with the SQL money functions (mirrors `domain-core`); compare to `client_totals` (online: mismatch error; offline: server totals win + `needs_review('total_mismatch')`).
7. Validate Σ payments + udhaar = total; udhaar ⇒ customer; credit limit policy.
8. Insert into invoice series: unique `(shop_id, device_id, fy, seq)`; violation → `DS_INVOICE_SEQUENCE_CONFLICT` (or replay if same operation).
9. Insert `sales`, `sale_items` (with snapshots), `sale_payments`.
10. Stock movements for tracked products (type `sale`), update `products.stock_on_hand_milli`; negative stock per setting.
11. Customer ledger debit for udhaar; update `customers.balance_paise`.
12. Audit entries for price overrides / large discounts; store idempotency result.

**Errors**: `DS_NOT_A_MEMBER`, `DS_PERMISSION_DENIED`, `DS_SHOP_SUSPENDED`, `DS_DEVICE_NOT_REGISTERED`,
`DS_VALIDATION_FAILED`, `DS_IDEMPOTENCY_CONFLICT`, `DS_TOTAL_MISMATCH`, `DS_PRODUCT_INACTIVE`,
`DS_INSUFFICIENT_STOCK`, `DS_CUSTOMER_REQUIRED`, `DS_CREDIT_LIMIT_EXCEEDED`, `DS_DISCOUNT_LIMIT_EXCEEDED`,
`DS_PRICE_OVERRIDE_DENIED`, `DS_INVOICE_SEQUENCE_CONFLICT`, `DS_APP_VERSION_UNSUPPORTED`.

**Retry**: safe with the same `client_operation_id` and payload. Client timeout 15 s; on timeout, retry
up to 3× with backoff, then hand to the outbox (Phase 09) — never generate a new id for the same bill.

**Tests**: totals parity with `domain-core` fixtures; replay returns same result; changed payload → conflict;
cross-shop product id rejected; cashier discount above limit rejected; udhaar without customer rejected;
concurrent same seq from two transactions → one wins; stock and ledger rows created; RLS prevents direct
`insert into sales`.

### 5.2 `void_sale`

Input: `{ client_operation_id, shop_id, sale_id, reason: string(3..200) }`.
Steps: permission + window check → lock sale `for update` → status must be `completed`/`needs_review` →
insert reversing stock movements (`sale_void`) and ledger credit (`sale_void`) → set `status='voided'`,
`voided_at`, `voided_by`, `void_reason` → audit. Output: updated sale summary.
Errors: `DS_SALE_ALREADY_VOIDED`, `DS_VOID_WINDOW_EXPIRED`, `DS_PERMISSION_DENIED`, `DS_NOT_FOUND`.

### 5.3 `record_customer_repayment`

Input: `{ client_operation_id, shop_id, device_id, customer_id, amount_paise > 0, method, reference?, occurred_at, note? }`.
Steps: permission `udhaar.collect` → lock customer `for update` → insert ledger entry (`repayment`, credit) →
update balance → output `{ entry_id, balance_paise }`. Overpayment allowed (balance may go negative =
advance), flagged in output `advance: true`.

### 5.4 `receive_purchase`

Input: `{ client_operation_id, shop_id, supplier_id?, supplier_invoice_no?, supplier_invoice_date?, lines:
[{ product_id, quantity_milli, unit_cost_paise, tax_rate_bp? }], payments: [...], update_selling_price?:
[{ product_id, price_paise }] }`.
Steps: permission → insert purchase + items → stock movements (`purchase`) → `products.last_cost_paise` →
optional price updates (with history) → supplier ledger (credit payable = total; debit per payment) → audit.

### 5.5 `adjust_stock`

Input: `{ client_operation_id, shop_id, product_id, delta_milli ≠ 0, reason: "damage"|"expiry"|"count_correction"|"opening"|"other", note? }`.
Output `{ movement_id, stock_on_hand_milli }`.

### 5.6 `get_shop_entitlements`

Output: `{ shop_id, plan_code, subscription_status, trial_ends_at?, current_period_ends_at?, revision,
entitlements: Record<EntitlementKey, boolean | number | null /* null = unlimited */>, usage: Record<QuotaKey, number> }`.
Resolution order in FEATURE_CONFIGURATION.md §4.

### 5.7 `get_client_config`

Output: `{ revision, min_supported_app_version, latest_app_version, maintenance?: {…}, flags:
Record<FlagKey, boolean>, announcements: [...], content: Record<ContentKey, LocalizedText>, defaults: {...} }`.
Unknown keys ignored by the client; invalid payload → client keeps last good cached config, then bundled defaults.

## 6. Third-party integrations (credentials required — none configured yet)

| Integration | Purpose | Where | Credentials |
|---|---|---|---|
| SMS provider (OD-02) | Phone OTP | Supabase Auth SMS hook | provider API key, DLT entity/template IDs |
| Payment provider (OD-05) | Subscription payments | Edge `payments-webhook` | key id/secret, webhook secret |
| Expo Push | Push notifications | Edge `send-notifications` | Expo access token (optional), FCM credentials in EAS |
| Sentry | Error monitoring | mobile, admin, edge | DSN (public), auth token (CI only) |
| Google Play | Distribution | EAS Submit | Play service account JSON |
