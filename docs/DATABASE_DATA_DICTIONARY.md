# Database Data Dictionary

Conventions for every table unless stated: `id uuid pk default gen_random_uuid()` (client-generated
UUID v7 for offline-creatable rows), `created_at timestamptz not null default now()`,
`updated_at timestamptz not null default now()` (trigger), `created_by uuid references auth.users`.
All tenant tables: `shop_id uuid not null references shops(id)`, RLS enabled.
Money `*_paise bigint`, quantity `*_milli bigint`, percentages `*_bp integer`.

## Identity and tenancy (Phase 02)

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | = `auth.users.id` |
| display_name | text | |
| phone_e164 | text unique null | copied from auth on signup trigger |
| preferred_language | text | `en` \| `hi`, default `hi` |

### `shops`
| Column | Type | Notes |
|---|---|---|
| name | text not null | 2–80 chars |
| business_category | text not null | `kirana`, `general`, `medical`, `hardware`, `stationery`, `cosmetics`, `other` (platform config list) |
| phone_e164 | text | |
| address_line, city, state_code, pincode | text | optional |
| timezone | text | default `Asia/Kolkata` |
| status | text | `active` \| `suspended` \| `closed`; only admin RPCs change it |
| created_by | uuid | owner who created |

### `shop_settings` (1:1 with shops, PK = shop_id)
| Column | Type | Default | Notes |
|---|---|---|---|
| invoice_prefix | text | `DS` | 1–6 chars `[A-Z0-9]` |
| tax_mode | text | `none` | `none` \| `gst_regular` \| `gst_composition` |
| gstin | text null | | validated format when tax_mode ≠ none |
| prices_include_tax | boolean | true | v1 supports only true |
| round_off_enabled | boolean | false | |
| enabled_payment_methods | text[] | `{cash,upi,udhaar}` | subset of `cash,upi,card,other,udhaar` |
| upi_vpa | text null | | e.g. `shop@okbank`; used for static QR |
| negative_stock_policy | text | `warn` | `allow` \| `warn` \| `block` |
| credit_limit_policy | text | `warn` | `none` \| `warn` \| `block` |
| void_window_minutes | integer | 1440 | non-owner limit |
| cashier_discount_limit_bp | integer | 0 | |
| manager_discount_limit_bp | integer | 1000 | |
| price_override_allowed | boolean | false | still needs `sale.price_override` permission |
| cashier_sees_all_sales | boolean | false | |
| preferences | jsonb | `{}` | receipt header/footer, language, low-stock default; validated against `preferences_schema_version` |
| preferences_schema_version | integer | 1 | |

### `shop_members`
| Column | Type | Notes |
|---|---|---|
| shop_id, user_id | pk (composite) | |
| role | text | `owner` \| `manager` \| `cashier` |
| status | text | `active` \| `deactivated` |
| invited_by | uuid null | |
| joined_at | timestamptz | |

Constraint (trigger): at least one active owner per shop.

### `shop_invitations`
| Column | Type | Notes |
|---|---|---|
| phone_e164 | text not null | |
| role | text | `manager` \| `cashier` (owner invitations need admin) |
| status | text | `pending` \| `accepted` \| `revoked` \| `expired` |
| expires_at | timestamptz | default now() + 7 days |

### `shop_devices`
| Column | Type | Notes |
|---|---|---|
| device_code | text | Short code unique per shop: `A`, `B`, … `Z`, `AA` |
| label | text | "Counter phone" |
| platform | text | `android` \| `ios` |
| registered_by | uuid | user |
| app_version | text | last seen |
| last_seen_at | timestamptz | |
| status | text | `active` \| `revoked` |
| unique | | `(shop_id, device_code)` |

### `role_permissions`
| Column | Type | Notes |
|---|---|---|
| role | text | shop role |
| permission | text | e.g. `sale.void` (catalogue in AUTHORIZATION_MATRIX.md) |
| pk | | `(role, permission)` — platform-managed, seeded |

### `platform_admins`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid pk | |
| role | text | `super_admin` \| `billing_admin` \| `onboarding_operator` \| `support_agent` \| `analyst` |
| status | text | `active` \| `disabled` |

No RLS-visible insert path; created by `admin-invite-operator` (super_admin) only.

## Configuration (Phase 02 seed, Phase 12 full)

### `entitlement_definitions`
| Column | Type | Notes |
|---|---|---|
| key | text pk | e.g. `products.max`, `voice.billing` |
| value_type | text | `boolean` \| `limit` |
| default_value | jsonb | value when no plan/override says otherwise (safe default) |
| description | text | |
| enforced_by | text | which RPC/trigger enforces it (documentation) |

### `subscription_plans`
| Column | Type | Notes |
|---|---|---|
| code | text unique | `free_trial`, `free_tier` (fallback after expiry, not purchasable), `starter`, `pro` |
| name | jsonb | localized `{en, hi}` |
| price_paise | bigint | per period |
| billing_period | text | `month` \| `year` \| `none` |
| trial_days | integer | |
| is_public | boolean | shown on plan screen |
| status | text | `draft` \| `active` \| `retired` |
| revision | integer | increments on change |

### `plan_entitlements`
`(plan_id, entitlement_key) pk`, `value jsonb` (`true/false` or integer limit, `null` = unlimited).

### `shop_subscriptions`
| Column | Type | Notes |
|---|---|---|
| plan_id | uuid | |
| status | text | `trialing` \| `active` \| `past_due` \| `grace` \| `expired` \| `cancelled` |
| current_period_start / end | timestamptz | |
| trial_ends_at | timestamptz null | |
| provider | text null | `manual` \| payment provider name |
| provider_subscription_id | text null | |
| is_current | boolean | partial unique index: one current per shop |

### `shop_entitlement_overrides`
`shop_id, entitlement_key, value jsonb, reason text not null, expires_at timestamptz null, created_by`.

### `feature_flags`
| Column | Type | Notes |
|---|---|---|
| key | text pk | e.g. `voice_billing`, `offline_sync`, `thermal_printing` |
| description | text | |
| enabled | boolean | global switch |
| rollout_percent | integer 0–100 | deterministic by `hash(shop_id‖key)` |
| kill_switchable | boolean | may be force-disabled in emergency |
| min_app_version | text null | flag off for older apps |
| revision | integer | |

### `feature_flag_overrides`
`(flag_key, shop_id) pk`, `enabled boolean`, `reason`, `expires_at null`.

### `platform_config`
| Column | Type | Notes |
|---|---|---|
| key | text pk | `min_supported_app_version`, `import.max_rows`, `maintenance`, `defaults.shop_settings` … |
| value | jsonb | validated against `schema_version` in admin RPC |
| schema_version | integer | |
| revision | integer | |

### `config_revisions`
Append-only copy of every change to `platform_config`, `feature_flags`, `subscription_plans`, `plan_entitlements`: `entity, entity_key, revision, value, changed_by, changed_at` — used for rollback.

### `content_blocks`
`key` (e.g. `help.billing.quick`), `locale`, `body` (markdown subset, rendered as text — never executed), `audience` (`all` \| role), `status`, `revision`.

### `announcements`
`title`, `body` (localized jsonb), `severity` (`info` \| `warning` \| `critical`), `audience` (all / plan codes / shop ids), `starts_at`, `ends_at`, `status`.

### `tax_rates`
`code` pk (`GST_0`, `GST_5`, `GST_18`, `GST_40`…), `rate_bp`, `label`, `effective_from`, `effective_to null`.

### `units`
`code` pk (`pc`, `kg`, `g`, `l`, `ml`, `dozen`, `pkt`, `box`, `m`), `label jsonb`, `allows_fraction boolean`, `base_unit null`, `factor_milli` (g→kg = 1).

## Catalogue (Phase 03)

### `categories`
`name`, `name_hi null`, `sort_order int`, `archived_at null`. Unique `(shop_id, lower(name)) where archived_at is null`.

### `products`
| Column | Type | Notes |
|---|---|---|
| name | text not null | |
| name_hi | text null | |
| category_id | uuid null | composite FK `(shop_id, category_id)` |
| unit_code | text | FK units |
| price_paise | bigint ≥ 0 | selling price (tax-inclusive) |
| mrp_paise | bigint null | |
| last_cost_paise | bigint null | updated by purchases |
| tax_rate_code | text null | FK tax_rates |
| hsn_code | text null | |
| track_stock | boolean | default false |
| stock_on_hand_milli | bigint | projection; **not client-writable** (column grants) |
| low_stock_threshold_milli | bigint null | |
| search_text | text | generated: lower(name ‖ name_hi ‖ aliases ‖ transliteration) |
| is_active | boolean | |
| archived_at | timestamptz null | soft delete |

### `product_barcodes`
`product_id`, `barcode text`, `format text`. Unique `(shop_id, barcode)`.

### `product_aliases`
`product_id`, `alias text` (e.g. "chini", "शक्कर"), `source` (`owner` \| `import` \| `voice_learned`).

### `product_price_history`
`product_id`, `price_paise`, `effective_from timestamptz`, `changed_by`. Insert-only, written by trigger.

## Imports and onboarding (Phase 03 / 11)

### `import_jobs`
`kind` (`products`), `status` (`uploaded` → `parsing` → `review` → `committing` → `committed` \| `failed` \| `cancelled`),
`storage_path`, `file_name`, `row_count`, `valid_count`, `error_count`, `created_by`, `created_for_onboarding_id null`, `committed_at`, `client_operation_id`.

### `import_job_rows`
`job_id`, `row_number`, `raw jsonb`, `normalized jsonb`, `errors jsonb` (list of `{field, code}`), `action` (`create` \| `update` \| `skip`), `matched_product_id null`.

### `onboarding_requests`
`requested_by`, `method` (`file` \| `photos` \| `callback`), `status` (`new` → `assigned` → `in_progress` → `awaiting_owner` → `completed` \| `cancelled`), `assigned_to null` (platform admin), `attachments text[]` (storage paths), `notes`, `owner_contact_phone`.

## Sales (Phase 04–06)

### `invoice_series`
`(shop_id, device_id, fy) pk`, `last_seq bigint`, `prefix text`.

### `sales`
| Column | Type | Notes |
|---|---|---|
| id | uuid (client v7) | |
| client_operation_id | uuid | unique `(shop_id, client_operation_id)` |
| device_id | uuid | |
| fy | text | `2627` |
| seq | bigint | unique `(shop_id, device_id, fy, seq)` |
| invoice_number | text | display string, generated |
| occurred_at | timestamptz | device time |
| recorded_at | timestamptz | server time |
| business_date | date | from occurred_at in shop tz |
| origin | text | `online` \| `offline_sync` |
| source | text | `keypad` \| `search` \| `scan` \| `voice` \| `mixed` |
| customer_id | uuid null | |
| customer_name_snapshot, customer_phone_snapshot | text null | |
| subtotal_paise, discount_paise, tax_paise, round_off_paise, total_paise | bigint | server-computed |
| paid_paise | bigint | Σ non-udhaar payments |
| udhaar_paise | bigint | |
| cost_total_paise | bigint null | Σ snapshot cost × qty where known |
| status | text | `completed` \| `needs_review` \| `voided` |
| review_reasons | text[] | |
| reviewed_by / reviewed_at | | owner acknowledges review |
| voided_at, voided_by, void_reason | | |
| cashier_id | uuid | = created_by |
| note | text null | |
| shop_name_snapshot, gstin_snapshot, tax_mode_snapshot | text | |

### `sale_items`
`sale_id`, `line_no`, `kind` (`product` \| `quick`), `product_id null`, `product_name`, `unit_code`, `quantity_milli`, `unit_price_paise`, `line_discount_paise`, `line_amount_paise`, `tax_rate_bp`, `tax_paise`, `hsn_code`, `cost_price_paise null`, `price_overridden boolean`.

### `sale_payments`
`sale_id`, `method` (`cash` \| `upi` \| `card` \| `other`), `amount_paise > 0`, `reference null`, `confirmation` (`manual`; `provider_verified` reserved for a future integration).

### `sale_returns` / `sale_return_items` (Phase 06)
Return header (`original_sale_id`, `client_operation_id`, `refund_method` cash/upi/udhaar_credit, `total_paise`, `reason`) and items (`sale_item_id`, `quantity_milli`, `amount_paise`).

## Expenses and day close (Phase 06)

### `expense_categories`
`name`, `name_hi`, `is_system boolean`, `archived_at`.

### `expenses`
`client_operation_id` unique per shop, `category_id`, `amount_paise > 0`, `method`, `occurred_at`, `business_date`, `note`, `attachment_path null`, `voided_at null`, `void_reason`.

### `day_closures`
`device_id`, `business_date`, `opening_cash_paise`, `expected_cash_paise`, `counted_cash_paise`, `difference_paise`, `note`, `closed_by`. Unique `(shop_id, device_id, business_date)`.

## Inventory (Phase 07)

### `stock_movements`
| Column | Type | Notes |
|---|---|---|
| product_id | uuid | |
| movement_type | text | `opening` \| `sale` \| `sale_void` \| `return` \| `purchase` \| `adjustment` \| `count` \| `import` |
| delta_milli | bigint ≠ 0 | signed |
| reason | text null | for adjustments |
| source_type / source_id | text / uuid | e.g. `sale_item` / id |
| occurred_at | timestamptz | |
| balance_after_milli | bigint | projection value after this movement |

## Suppliers and purchases (Phase 07)

### `suppliers`
`name`, `phone_e164`, `gstin null`, `balance_paise` (projection; positive = we owe), `archived_at`.

### `supplier_ledger_entries`
`supplier_id`, `entry_type` (`opening` \| `purchase` \| `payment` \| `adjustment`), `amount_paise` signed, `method null`, `source_id null`, `occurred_at`, `client_operation_id`.

### `purchases`
`client_operation_id`, `supplier_id null`, `supplier_invoice_no`, `supplier_invoice_date`, `total_paise`, `paid_paise`, `status` (`received` \| `voided`), `occurred_at`.

### `purchase_items`
`purchase_id`, `product_id`, `quantity_milli`, `unit_cost_paise`, `line_total_paise`, `tax_rate_bp null`.

## Customers and udhaar (Phase 08)

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid (client v7) | offline-creatable |
| client_operation_id | uuid | |
| name | text | |
| phone_e164 | text null | unique per shop when not null |
| address, notes | text null | |
| credit_limit_paise | bigint null | |
| balance_paise | bigint | projection, not client-writable |
| last_activity_at | timestamptz | |
| archived_at | timestamptz null | cannot archive with non-zero balance |

### `customer_ledger_entries`
`customer_id`, `entry_type` (`opening` \| `credit_sale` \| `repayment` \| `sale_void` \| `return_credit` \| `adjustment`), `amount_paise` signed (+ owes more), `method null` (repayment), `source_type`/`source_id`, `occurred_at`, `balance_after_paise`, `client_operation_id`, `note`.

## Sync (Phase 09)

### `sync_batches`
`device_id`, `received_at`, `op_count`, `app_version`.

### `sync_operation_results`
`batch_id`, `client_operation_id`, `operation`, `status` (`applied` \| `replayed` \| `needs_review` \| `quarantined`), `error_code null`, `result jsonb`.

## Notifications, support, billing events, usage

### `push_tokens`
`user_id`, `device_id`, `expo_push_token`, `status`, `last_used_at`.

### `notifications`
`user_id null`, `kind`, `title`, `body`, `data jsonb`, `status` (`queued` \| `sent` \| `failed` \| `read`), `template_key`.

### `notification_templates`
`key`, `locale`, `title`, `body` (with `{{placeholders}}` from an allow-list), `revision`.

### `support_tickets`
`created_by`, `category` (`billing` \| `bug` \| `onboarding` \| `subscription` \| `other`), `subject`, `status` (`open` \| `pending_customer` \| `pending_internal` \| `resolved` \| `closed`), `priority`, `assigned_to null`, `client_operation_id`.

### `support_ticket_messages`
`ticket_id`, `author_id`, `author_kind` (`shop` \| `platform`), `body`, `attachment_path null`, `is_internal boolean` (internal notes never visible to shop — RLS).

### `subscription_events`
`provider`, `provider_event_id` unique, `event_type`, `shop_id null`, `payload jsonb` (scrubbed), `processed_at`, `result`.

### `usage_counters`
`(shop_id, key, period) pk`, `value bigint` — e.g. `exports.monthly` for `2026-11`.

## Audit

### `audit.events`
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | |
| occurred_at | timestamptz | |
| actor_user_id | uuid null | null for system/webhook |
| actor_kind | text | `shop_user` \| `platform_admin` \| `system` |
| shop_id | uuid null | |
| action | text | `sale.void`, `member.role_changed`, `admin.plan_assigned` … |
| entity_type / entity_id | text / text | |
| before / after | jsonb | minimal diff, PII-scrubbed |
| reason | text null | |
| request_id | text null | |

No update/delete for any role except retention job (super-user migration only).
