# Authorization Matrix

Permissions are strings stored in `role_permissions` (seeded by migration, changeable only by
`super_admin` through an audited admin RPC). The mobile app reads the resolved permission list for the
active membership (`get_my_context`) to hide UI; **the database enforces the same list**.

Legend: ✅ allowed · ⚙️ allowed subject to shop setting/limit · ❌ denied.

## 1. Shop roles

| Permission | Description | Owner | Manager | Cashier |
|---|---|---|---|---|
| `sale.create` | Create bills | ✅ | ✅ | ✅ |
| `sale.discount` | Discounts (role limit in settings) | ✅ unlimited | ⚙️ `manager_discount_limit_bp` | ⚙️ `cashier_discount_limit_bp` (default 0) |
| `sale.price_override` | Change price at billing | ✅ ⚙️ `price_override_allowed` | ⚙️ | ❌ |
| `sale.view_all` | See all staff's bills | ✅ | ✅ | ⚙️ `cashier_sees_all_sales` |
| `sale.void` | Void bill | ✅ any time | ⚙️ within `void_window_minutes` | ❌ |
| `sale.return` | Returns / refunds | ✅ | ✅ | ❌ |
| `sale.review` | Acknowledge `needs_review` sales | ✅ | ✅ | ❌ |
| `product.view` | See catalogue | ✅ | ✅ | ✅ |
| `product.manage` | Create/edit products, categories, import | ✅ | ✅ | ❌ |
| `product.view_cost` | See cost price | ✅ | ✅ | ❌ |
| `stock.view` | See stock levels | ✅ | ✅ | ✅ |
| `stock.adjust` | Adjustments, stock count | ✅ | ✅ | ❌ |
| `purchase.view` | Suppliers & purchases | ✅ | ✅ | ❌ |
| `purchase.manage` / `purchase.receive` | Add suppliers, receive purchases | ✅ | ✅ | ❌ |
| `purchase.pay` | Pay suppliers | ✅ | ✅ | ❌ |
| `customer.view` | Customer list, balances | ✅ | ✅ | ✅ |
| `customer.manage` | Create/edit customers | ✅ | ✅ | ⚙️ quick-create only at billing |
| `udhaar.grant` | Give credit on a bill | ✅ | ✅ | ✅ (credit-limit policy applies) |
| `udhaar.collect` | Record repayment | ✅ | ✅ | ✅ |
| `udhaar.adjust` | Manual balance adjustment | ✅ | ❌ | ❌ |
| `expense.create` | Record expense | ✅ | ✅ | ❌ |
| `expense.view` | See expenses | ✅ | ✅ | ❌ |
| `day.close` | Cash reconciliation | ✅ | ✅ | ✅ (own device) |
| `report.view_sales` | Sales dashboard and reports | ✅ | ✅ | ❌ (sees own today total only) |
| `report.view_profit` | Profit/cost reports | ✅ | ❌ | ❌ |
| `report.export` | Export CSV/PDF | ✅ | ✅ | ❌ |
| `staff.manage` | Invite, change role, deactivate, revoke devices | ✅ | ❌ | ❌ |
| `settings.manage` | Shop settings | ✅ | ❌ | ❌ |
| `subscription.view` | Plan & usage screen | ✅ | ✅ | ❌ |
| `onboarding.request` | Request managed onboarding | ✅ | ✅ | ❌ |
| `support.create` | Create tickets | ✅ | ✅ | ✅ |
| `audit.view_shop` | Shop audit trail (voids, overrides) | ✅ | ❌ | ❌ |

Invariant: a shop has ≥ 1 active owner. Ownership transfer = owner promotes another member to owner, then may step down.

## 2. Entitlement gates (independent of role)

A permission check passes only if the entitlement also allows it. Examples (catalogue in FEATURE_CONFIGURATION.md §3):

| Operation | Entitlement |
|---|---|
| Insert product beyond limit | `products.max` |
| Invite staff beyond limit | `staff_accounts.max` |
| Register device beyond limit | `devices.max` |
| Voice billing | `voice.billing` (+ flag `voice_billing`) |
| Reports > 7 days, product/category/staff breakdowns | `reports.advanced` |
| Export | `reports.export`, quota `exports.monthly` |
| Import | `catalogue.import`, quota `import.rows_per_job` |
| Suppliers & purchases | `purchases.enabled` |
| Managed onboarding | `onboarding.managed` |
| Offline billing | `offline.enabled` (+ flag `offline_sync`) |

Expired subscription behaviour: **billing never stops** (shops must be able to sell). Expired/grace plans
fall back to the `free_tier` entitlement set (limits on reports, exports, staff), and creation beyond
limits is blocked — existing data stays readable.

## 3. Platform roles (admin panel)

| Capability | super_admin | billing_admin | onboarding_operator | support_agent | analyst |
|---|---|---|---|---|---|
| Dashboard metrics (aggregates) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List/search shops (name, city, plan, status) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shop detail: members, devices, usage, subscription | ✅ | ✅ | ✅ | ✅ | ❌ |
| Shop detail: customer-level PII | ✅ | ❌ | ❌ | ✅ with ticket ref (logged) | ❌ |
| Suspend / reactivate shop | ✅ | ✅ (non-payment) | ❌ | ❌ | ❌ |
| Manage members on behalf (e.g. replace lost owner) | ✅ | ❌ | ❌ | ✅ with verification checklist | ❌ |
| Onboarding queue, import jobs for shop | ✅ | ❌ | ✅ | ❌ | ❌ |
| Plans, entitlements, assign plan, overrides | ✅ | ✅ | ❌ | ❌ | ❌ |
| Feature flags & kill switches | ✅ | ❌ | ❌ | ❌ | ❌ |
| Platform config, tax rates, units, content, templates | ✅ | ❌ | ❌ | content only (help articles) | ❌ |
| Announcements | ✅ | ✅ (billing notices) | ❌ | ✅ | ❌ |
| Support tickets | ✅ | ✅ (subscription category) | ✅ (onboarding category) | ✅ | ❌ |
| Audit log viewer | ✅ | own module | own module | own module | ❌ |
| Operator accounts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit/delete shop financial records | ❌ **nobody** | ❌ | ❌ | ❌ | ❌ |

Financial corrections for a shop are made by the shop (void/return/adjustment). If a platform-side fix is
ever required, it is a reviewed SQL migration/script with an audit entry, never an admin UI action.
