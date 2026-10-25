# Phase 05 — Product Billing, Barcode Scanning, Payments, Receipts, History, Void

Status: **Complete — awaiting approval** · Date: 2026-10-25 · Spec: [../features/billing.md](../features/billing.md)

## Features implemented (end-to-end)

### 1. Catalogue items on the bill
`BillingScreen` gains a search box and a scan button above the keypad. Billing reads the catalogue only through the
`ProductFinder` port (search, exact barcode, reference data); the composition root adapts the catalogue feature's
`SearchProducts` / `LoadCatalogueReference` to it (ADR-040).
- **Search:** typing (250 ms debounce) lists up to 6 items with price per unit; a tap adds one unit (`productLine`:
  tax rate from the reference data, fraction rule from the unit). Adding the same item again adds one more unit.
- **Line editor** (tap a product line, `LineEditorSheet`): quantity (decimals only for kg / litre / … units),
  **"or amount worth ₹"** for loose items (`quantityFromAmount`: floor, whole units for piece items), price override
  (only with `sale.price_override` and the shop setting), line discount (with `sale.discount`), remove.
- Quick (keypad) amounts and product lines mix on one bill; totals come from `computeBill` including GST for
  `gst_regular` shops (shown as "GST included").

### 2. Barcode scanning
`ScannerSheet` uses `expo-camera`'s `CameraView` (EAN-13/8, UPC-A/E, Code 128/39, QR) after asking for camera permission.
A known code adds the item (one more unit if already on the bill); an unknown code shows the code and, for users with
`product.manage`, **Create item with this barcode** → the product form opens with the barcode filled in.
The camera plugin is configured in `app.json`.

### 3. Server rules for product lines (`create_sale`, migration `p05_product_billing`)
Products are locked `FOR UPDATE`; for each line: product must belong to the shop (`DS_VALIDATION_FAILED`) and be active
(`DS_PRODUCT_INACTIVE`); piece units refuse fractions; a price different from the catalogue is
- an **override** when the line says so → needs `sale.price_override` **and** `price_override_allowed`
  (`DS_PRICE_OVERRIDE_DENIED`), audited as `sale.price_override`;
- otherwise a **changed price** → `DS_TOTAL_MISMATCH {reason: price_changed, currentPricePaise}` (ADR-038).
Line + bill discounts together are checked against the role limit. Lines keep snapshots: name, unit, tax rate, HSN, cost.
The app maps `price_changed` to a domain `PriceChanged`, takes the new price into the bill (unless overridden), returns to
editing and asks the user to check the total and pay again.

### 4. Stock on sale
New `stock_movements` table (signed quantities; Phase 07 adds purchases / adjustments / opening stock). For products with
`track_stock`, each sale writes a `sale` movement and lowers `stock_on_hand_milli`. Shop policy `negative_stock_policy`:
`block` → `DS_INSUFFICIENT_STOCK`; `warn` → sale saved with a `NEGATIVE_STOCK` warning in the result; `allow` → silent.

### 5. Split payment (BL-407)
Payment sheet → **Split payment**: choose a second method and its amount; the first method takes the rest
(`splitPayments`). Cash change and the UPI QR use only their own part.

### 6. Sales history
New **Sales** tab → `SalesHistoryScreen` / `useSalesHistoryViewModel` → `ListSales` → `list_sales` RPC: Today / 7 days / All
(days start at midnight IST), *Voided only*, search by bill number or item name, infinite list with a keyset cursor. Cashiers
see only their own bills unless the shop allows more. A tap opens the receipt.

### 7. Void
Receipt screen → **Void bill** (users with `sale.void`) → reason (3–200 characters) → `VoidSale` → `void_sale` RPC:
owner any time, manager within `void_window_minutes` (`DS_VOID_WINDOW_EXPIRED`), cashier never; already voided →
`DS_SALE_ALREADY_VOIDED`. Stock is returned with `sale_void` movements, the sale is marked `voided` with who/when/why,
audited; nothing is deleted. Idempotent by operation id (one id per reason text in the ViewModel). The receipt then shows a
"VOIDED: reason" banner, and the shared text/PDF starts with it.

### 8. GST receipt (BL-507)
GST-registered shops get "Tax invoice" under the shop name, HSN per product line, and the CGST/SGST split; product lines
show quantity × price ("Pyaaz (0.625 kg × ₹40.00)").

## Inventory
- **Screens / components / ViewModels:** Billing (+ PaymentSheet, LineEditorSheet, ScannerSheet) / useBilling;
  Receipt / useReceipt (void); SalesHistory / useSalesHistory.
- **Use cases:** CreateSale (replaces CreateQuickSale; takes payments), GetSale, ListSales, VoidSale, ShareReceipt; pure:
  `productLine`, `addProductLine`, `quantityFromText`, `quantityFromAmount`, `lineAmount`, `splitPayments`,
  `startOfIstDay`, receipt builders.
- **Repository:** BillingRepository + `listSales`, `voidSale`; BillingRepositoryImpl maps `DS_INVOICE_SEQUENCE_CONFLICT`
  and `price_changed` to domain errors.
- **Ports:** `ProductFinder` (new), `InvoiceCounterStore`, `ReceiptSharer`.
- **Contracts:** `ProductSaleLineSchema`, `SaleLineInputSchema`, warnings in `CreateSaleOutputSchema`, `VoidSaleInputSchema`,
  `SaleListItemSchema`, `SalePageSchema`; `database.types.ts` + `stock_movements`, `void_sale`, `list_sales`.
- **Catalogue:** product form accepts `initialBarcode` (route param `barcode`).
- **Native package added:** `expo-camera` (config plugin in `app.json`).
- **Strings:** en + hi, 343 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261025021739_p05_product_billing` | `sale_items` + cost, HSN, override flag; `stock_movements` (+ RLS `stock.view`); `sale_json` + HSN / override / voided by; `create_sale` with product lines and stock; `void_sale`; `list_sales` |

**RLS / security:** `stock_movements` readable with `stock.view`, no client writes. `void_sale` / `list_sales` are
SECURITY DEFINER, `search_path = ''`, `authenticated` only, membership and permission checked per call. Performance advisor
after the migration: only "unused index" notices (no traffic on the dev project yet).

## Tests executed (2026-10-25)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **129 / 129** (26 billing tests, 10 new) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **29 / 29** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **205 / 205** assertions, 11 files (new `011_product_sales` 30) |
| DB pgTAP + concurrency on real Supabase (CI) | ✅ passed on `60740db` ([run 40154940972](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40154940972)) |

New database tests: piece + loose lines with snapshots; stock decreases only for tracked products; fractions refused for
piece units; stale price → `DS_TOTAL_MISMATCH`; override refused while the shop disallows it, allowed for the owner after,
audited; cashier override refused; cashier line discount above the limit refused; archived product refused; product of
another shop refused; `warn` policy returns `NEGATIVE_STOCK`; `block` policy refuses and changes nothing; GST 18 % on ₹118
= ₹18 with rate + HSN kept; cashier cannot void; owner void returns stock and keeps the lines; repeated void request
replays; second void refused; manager outside the window refused, inside allowed; history lists all / pages with the
cursor without duplicates / searches item names / filters voided / limits cashiers to their own bills.

New app tests: product lines (fractions, "₹10 worth" = 250 g, ₹100 of a ₹45 piece item = 2, repeat add), GST and line
discount totals, split rules, command with override / line discount / split / source; scan known twice + unknown; line
editor amount and override; price-changed recovery; split payment submit; search → add → UPI QR for ₹45; void with reason
→ "VOIDED" banner; Hindi receipt; IST day start; history with voided filter.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅, admin build ✅, Android Metro export ✅.

Found while testing: the history filter chip and the row badge were both labelled "Voided" (now "Voided only");
`VoidSale` threw synchronously instead of returning a rejected promise.

## Acceptance criteria
- [x] Itemised and mixed bills with loose quantities and amount entry.
- [~] Barcode scan adds items; unknown codes handled — implemented and tested through the ViewModel with a mocked camera;
  **not yet tried with a real camera** (needs a device; `expo-camera` runs in Expo Go).
- [x] Discount / override limits enforced server-side (cashier override and line discount refused in pgTAP).
- [x] Void reverses stock; nothing deleted. Ledger reversal arrives with udhaar in Phase 08 (no customer ledger yet).
- [~] Thermal printer spike recorded — desk research in [../spikes/THERMAL_PRINTING.md](../spikes/THERMAL_PRINTING.md);
  OD-08 stays open until pilot printers can be tried.
- [ ] Maestro journeys J-01 / J-04 — not run: no device or emulator here.

## Decisions (DECISIONS.md)
ADR-038 price changes vs overrides · ADR-039 `stock_movements` created now, tracked products only · ADR-040 billing reads the
catalogue through a port · ADR-041 void rules.

## Known limitations (Phase 05)
- No UI yet to turn on stock tracking or enter stock; it arrives with inventory (Phase 07). Until then stock moves only for
  products saved with `trackStock` (import or API).
- Split payment supports two methods in the UI (the RPC accepts up to 10).
- History "Today" is computed when the filter changes; leaving the screen open across midnight keeps the old day until a
  filter or refresh.
- Camera scanning, PDF sharing and the whole app are still untested on a device; the dev project's Auth settings (email
  template, SMS provider) are still pending, so nobody can sign in on a phone yet.

## External configuration still required
Unchanged: Supabase Auth email template with `{{ .Token }}` and an SMS provider (OD-02); EAS account for a development build
once a native module outside Expo Go is added (thermal printing would be the first).

## Recommended next phase
Phase 06 — reports, expenses, returns and day close.
