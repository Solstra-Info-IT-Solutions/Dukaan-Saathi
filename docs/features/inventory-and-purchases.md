# Feature: Inventory, Stock Movements, Suppliers, Purchases

Status: Planned · Phase: 07 · Requirements: FR-12, FR-13

## Purpose
Know what is in stock, why it changed, what needs reordering, and what is owed to suppliers.

## Screens and ViewModels
| Screen | ViewModel |
|---|---|
| StockScreen (list, low-stock filter, movement history per product) | useStockViewModel |
| StockAdjustScreen | useStockAdjustViewModel |
| StockCountScreen (count many products, review differences, submit) | useStockCountViewModel |
| SuppliersScreen / SupplierDetailScreen (ledger) | useSuppliersViewModel / useSupplierDetailViewModel |
| PurchaseFormScreen (lines via search/scan, cost, payments) | usePurchaseFormViewModel |
| SupplierPaymentSheet | useSupplierPaymentViewModel |

## Use cases
`ListStock`, `GetStockMovements`, `AdjustStock`, `SubmitStockCount`, `ListLowStock`, `CreateSupplier`, `ListSuppliers`,
`GetSupplierLedger`, `ReceivePurchase`, `RecordSupplierPayment`.

## Repositories / data sources
- `InventoryRepository` → `from('products')` (stock columns), `from('stock_movements')`, `rpc adjust_stock`, `rpc submit_stock_count`.
- `PurchaseRepository` → `rpc create_supplier`, `from('suppliers')`, `from('supplier_ledger_entries')`, `rpc receive_purchase`, `rpc record_supplier_payment`.

## Rules
- Every stock change is a movement; `stock_on_hand_milli` only changes inside RPCs/triggers in the same transaction.
- Stock count: for each counted product, delta = counted − on hand at submit time (server recomputes under lock).
- Purchase receipt updates `last_cost_paise`; optional selling-price update writes price history.
- Supplier ledger sign: + = we owe more (purchase), − = we paid.
- Negative stock policy applies to sales (BR / settings), not to adjustments by owner.

## Authorization / entitlements
`stock.view` (all), `stock.adjust`, `purchase.*` (owner/manager). Entitlement `purchases.enabled`.

## Tests
Movement + projection consistency after sale, void, purchase, adjustment, count; rebuild function equals projection; concurrent adjustments; supplier ledger balances; RLS on all tables.

## Acceptance criteria
- [ ] Receiving a purchase of 10 kg increases stock by 10,000 milli and supplier balance by the total minus payments, atomically.
- [ ] Movement history explains every change in on-hand quantity.
- [ ] Low-stock list matches thresholds.

## Limitations
No batch/expiry tracking (medical shops will ask — backlog BL-I05). No purchase orders/returns to supplier in v1.
