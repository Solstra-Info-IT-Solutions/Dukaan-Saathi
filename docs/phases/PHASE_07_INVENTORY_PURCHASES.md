# Phase 07 — Inventory, Stock Movements, Suppliers, Purchases

Status: **Complete — awaiting approval** · Date: 2026-10-25 · Spec: [../features/inventory-and-purchases.md](../features/inventory-and-purchases.md)

## Features implemented (end-to-end)

### 1. Stock tracking per item
Item form → **Track stock** switch and **Low-stock alert at** (quantity in the item's unit) → `SaveProduct`
(`trackStock`, `lowStockThresholdMilli`) → `save_product`. Tracking is opt-in per item (ADR-048).

### 2. Stock list, history and adjustments
More → **Stock** (`stock.view`, all roles) → `StockScreen` / `useStockViewModel` → `ListStock` → `list_stock`:
tracked items with on-hand quantity, low items first and marked, **Low stock** filter, search.
Tap an item → `StockItemScreen` / `useStockItemViewModel`:
- **history** from `stock_movements` (sold, voided, returned, purchased, adjusted, opening) — every change in on-hand is
  explained by a row;
- **Change stock** (`stock.adjust`: owner, manager) → add / remove, quantity (whole units for piece items), reason
  (damaged, expired, count correction, opening stock, other), note → `AdjustStock` → `adjust_stock`. An item without
  history defaults to "opening stock". One operation id per typed adjustment, so a retry is not applied twice.

### 3. Stock count
Stock → **Count stock** → `StockCountScreen` / `useStockCountViewModel`: type what is on the shelf for any items →
`SubmitStockCount` (only filled-in items) → `submit_stock_count`: each product is locked (in product-id order, so counts
cannot deadlock), adjusted by counted − on hand with reason `count_correction`; the screen lists what changed.

### 4. Stock records check (BL-706)
Stock → **Check stock records** → `check_stock_drift`: products whose on-hand differs from the sum of their movements
(`private.stock_from_movements`). On-hand only changes inside RPCs through `private.move_stock`, which writes the movement
in the same transaction (ADR-047), so this list should always be empty; the test proves a change made outside a movement is
caught.

### 5. Suppliers and their account
More → **Suppliers & purchases** (`purchase.view`: owner, manager) → `SuppliersScreen`: total owed and each supplier's
balance (owe / paid ahead / settled). **Add supplier** (`purchase.manage`) → name, phone, amount already owed, note →
`SaveSupplier` → `save_supplier` (client id, so creating twice is safe; opening balance only on creation; names unique
per shop). Supplier → `SupplierDetailScreen`: balance, account (opening, purchases, payments) and **Pay supplier**
(`purchase.pay`) → `RecordSupplierPayment` → `record_supplier_payment`. The balance is always the sum of the account
entries, updated in the same transaction (ADR-049).

### 6. Goods received
**Goods received** (`purchase.receive`, entitlement `purchases.enabled`) → `PurchaseFormScreen` /
`usePurchaseFormViewModel`: supplier (or cash purchase), supplier bill no., items by search with quantity, cost per unit
(pre-filled with the last cost) and an optional new selling price; total shown live (same rounding as the server); paid now
and method → `ReceivePurchase` → `receive_purchase`, one transaction:
- stock up for tracked items (`purchase` movements), cost price updated for every item;
- new selling prices applied (price history written by the existing trigger);
- supplier account + total, − payment; without a supplier the purchase must be paid in full (ADR-050);
- audited, idempotent; the catalogue and stock screens refresh afterwards.

### 7. Day close
Cash paid to suppliers from a phone (in purchases or separate payments) is now subtracted from that phone's expected
cash (`cashSupplierPaymentsPaise` in the breakdown; older closings read it as 0).

## Inventory
- **New features:** `inventory` (Stock, StockItem, StockCount; ListStock, GetStockMovements, AdjustStock,
  SubmitStockCount, CheckStockDrift; InventoryRepository → Impl → SupabaseInventoryDataSource) and `purchases`
  (Suppliers, SupplierForm, SupplierDetail, PurchaseForm; ListSuppliers, SaveSupplier, GetSupplierLedger,
  ReceivePurchase, RecordSupplierPayment; pure `purchaseLine`, `parsePurchaseLines`, `purchaseTotal`;
  PurchaseRepository → Impl → SupabasePurchaseDataSource). Purchases read the catalogue through the
  `PurchaseProductFinder` port (same adapter as billing).
- **Contracts:** `inventory.ts`; `SaveProductInput` + stock fields; day-close breakdown + supplier cash.
- **Navigation:** More → Stock (`stock.view`), Suppliers & purchases (`purchase.view`); hidden routes `stock`,
  `stock-item`, `stock-count`, `suppliers`, `supplier`, `supplier-new`, `purchase-new`.
- **Strings:** en + hi, 517 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261025034232_p07_inventory_purchases` | movement reason/note/purchase; `stock_from_movements`, `move_stock`, `lock_tracked_product`; RPCs `adjust_stock`, `submit_stock_count`, `list_stock`, `check_stock_drift`; `suppliers`, `purchases`, `purchase_items`, `purchase_payments`, `supplier_ledger_entries`; `add_supplier_entry`; RPCs `save_supplier`, `receive_purchase`, `record_supplier_payment`; `cash_breakdown` with supplier cash |
| `20261025034257_p07_fk_indexes` | Covering indexes for `(shop_id, device_id)` foreign keys flagged by the performance advisor |

**RLS / security:** supplier, purchase and ledger tables readable with `purchase.view`; no client writes. Stock changes need
`stock.adjust`; purchases `purchase.receive` and the `purchases.enabled` entitlement; payments `purchase.pay`. All writes are
SECURITY DEFINER RPCs with `search_path = ''`.

## Tests executed (2026-10-25)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **154 / 154** (13 suites; new inventory 6, purchases 6) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **269 / 269** assertions (new `014_inventory_purchases` 30) |
| DB pgTAP + storage + concurrency on real Supabase (CI) | ✅ passed on `b1fdf29` ([run 40169970071](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40169970071)); `03a6aba` failed only the flaky sales-history test (fixed) |

Database tests: opening stock as an `opening` movement; untracked items and fractional pieces refused; adjustment replay;
count adjusts by counted − on hand; low-stock list; stock list shows only tracked items; supplier opening balance; edits never
change the balance; unique names; cashier cannot manage suppliers, adjust stock or read purchases; **receiving 10 kg atta +
12 soap: stock +10,000 / +12,000 milli, supplier balance 500 + 700 − 200 = 1,000**, cost and new price updated with price
history; purchase replay adds nothing twice; cash purchase must be paid in full; untracked item purchase moves no stock;
supplier payment; **balance = sum of ledger**; ledger shows every entry; day close subtracts ₹575 paid to suppliers;
drift check empty, then catches a change made outside a movement; `purchases.enabled` gate; shop B cannot read shop A
suppliers.
App tests: whole-unit rule; negative adjustment with reason and trimmed note; count sends only filled-in items; stock screen
(low marking, filter, records check, open item); item screen (history, whole-unit error, add 12 → 13); count result;
purchase line defaults and live total; cash purchase must be paid in full; paid > total refused; bad line reported by key;
suppliers list with total owed; receiving 10 kg from a supplier with part payment and a new price; paying a supplier.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅, admin build ✅, Android Metro export ✅.

CI found one more flaky screen test on `03a6aba` (now readable thanks to the CI annotations): the sales-history test
checked that a bill disappeared after filtering, but the list is briefly empty while the filtered page loads, so the next
step could not find the voided bill. It now waits for the filtered result itself; the new stock-list test had the same
pattern and was fixed the same way (BL-406). 3 of 3 local runs with 2 workers pass.

Session note: midway, every shell command was refused because auto mode's safety check returned no verdict; the work
continued after the permission mode was switched away from auto mode. No code was affected.

## Acceptance criteria
- [x] Every on-hand change explained by a movement; rebuild equals projection (drift check, tests).
- [x] Purchase receipt atomic across stock, cost, supplier ledger, payments.
- [~] Low-stock list ✅; the low-stock **digest** notification needs push credentials (with BL-607).
- [x] Receiving 10 kg increases stock by 10,000 milli and the supplier balance by the total minus payments, atomically.

## Decisions (DECISIONS.md)
ADR-047 movements explain on-hand · ADR-048 tracking opt-in per item · ADR-049 supplier ledger and balance ·
ADR-050 unpaid purchases need a supplier; supplier cash in day close.

## Known limitations (Phase 07)
- No purchase history screen, supplier edit/archive screens or returns to suppliers yet (BL-708; RPCs edit suppliers already).
- No batch / expiry tracking (BL-I05). Purchases record cost including tax; no input-tax (GST credit) tracking.
- Low-stock digest notification not built (push credentials).
- The app is still untested on a device; the Supabase Auth settings are still pending.

## External configuration still required
Unchanged: Supabase Auth email template with `{{ .Token }}` and an SMS provider (OD-02); EAS account; push credentials.

## Recommended next phase
Phase 08 — customers, udhaar and the customer ledger.
