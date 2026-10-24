# Feature: Product Catalogue, Categories, Units, Import

Status: Planned · Phase: 03 (import basics), 11 (operator workflow) · Requirements: FR-04, FR-17

## Purpose
Maintain the shop's products for fast search, scanning and voice matching; bulk-load products from CSV/XLSX
with a review step so bad rows never silently enter the catalogue.

## Screens and ViewModels
| Screen | ViewModel | State model |
|---|---|---|
| ProductsScreen | useProductsViewModel | infinite list, search query, category filter, `loading/loaded/empty/error` |
| ProductFormScreen | useProductFormViewModel | RHF form; `editing → saving → saved → error`; barcode scan field |
| CategoriesScreen | useCategoriesViewModel | list, reorder, add/rename/archive |
| ImportScreen | useImportViewModel | `pickFile → uploading → parsing → review → committing → committed → error` |
| ImportReviewScreen | useImportViewModel | rows with errors, filters (errors only), inline fix, action per row |

## User actions
search · filterByCategory · createProduct · editProduct · archiveProduct · addBarcode (scan) · addAlias ·
manageCategories · pickImportFile · fixRow · setRowAction(create/update/skip) · commitImport · downloadTemplate.

## Use cases
`SearchProducts`, `GetProduct`, `SaveProduct` (create/update; price change creates history server-side), `ArchiveProduct`,
`ListCategories`, `SaveCategory`, `ArchiveCategory`, `StartImport` (upload + preview), `UpdateImportRow`, `CommitImport`.

## Repository interfaces
- `CatalogueRepository`: `searchProducts(shopId, query, page)`, `listProducts(shopId, filter, page)`, `getProduct`, `saveProduct`,
  `archiveProduct`, `findByBarcode(shopId, code)`, `listCategories`, `saveCategory`, `archiveCategory`, `listUnits`, `listTaxRates`.
- `ImportRepository`: `uploadFile`, `preview(jobId)`, `getJob`, `listRows(jobId, filter, page)`, `updateRow`, `commit(jobId, opId)`.

## Data sources
| Data source | Calls |
|---|---|
| SupabaseCatalogueDataSource | `rpc search_products`; `from('products')` select/insert/update (explicit columns); `product_barcodes`, `product_aliases`, `categories`, `units`, `tax_rates` |
| SupabaseImportDataSource | `storage.from('import-files').upload`; `functions.invoke('import-preview')`; `rpc update_import_row`, `rpc commit_product_import`; `from('import_job_rows')` select |
| LocalCatalogueDataSource (Phase 09) | `products_cache` FTS/LIKE search |

## Database
Tables: `categories`, `products`, `product_barcodes`, `product_aliases`, `product_price_history`, `import_jobs`, `import_job_rows`.
Triggers: products quota (`products.max`), price history on insert/update of `price_paise`, `search_text` maintenance, `updated_at`.
Opening stock from import → `stock_movements(type='import')` (only if `track_stock`; full inventory in Phase 07 but the movement table is created here).

## Import rules
- Accepted: `.csv` (UTF-8, with or without BOM), `.xlsx` (first sheet). Max size `import.max_file_mb`; rows ≤ `import.rows_per_job`.
- Columns (header names in English or Hindi, case-insensitive, mapped by synonyms): name*, name_hi, category, unit, price*, mrp, cost, barcode, tax_rate, hsn, opening_stock, low_stock_threshold.
- Row errors: `REQUIRED`, `INVALID_PRICE` (non-numeric, negative, > ₹10,00,000), `UNKNOWN_UNIT` (mapped via synonyms: "kilo", "kg", "किलो"), `DUPLICATE_IN_FILE`, `BARCODE_TAKEN`, `TOO_LONG`.
- Match existing product by barcode, then exact normalized name → default action `update`, else `create`.
- Commit: one transaction; `import_jobs.status` guards double commit; idempotent by `client_operation_id`; quota checked on net new products.
- Prices parsed from strings like "₹1,250.50", "1250.5" → paise with exact decimal parsing (no float).

## Validation
| Rule | Client | Server |
|---|---|---|
| name 1–120 chars | Zod | check |
| price ≥ 0, ≤ 1e8 paise | Zod | check |
| unit exists | picker | FK |
| barcode unique per shop | async check | unique index → `DS_CONFLICT` |
| loose unit allows fraction | domain | `units.allows_fraction` |

## Errors
`DS_QUOTA_EXCEEDED(products.max)` → upsell sheet · `DS_CONFLICT` barcode → field error · `DS_ENTITLEMENT_REQUIRED(catalogue.import)` → plan screen · import parse failure → job `failed` with reason.

## Authorization
Read: any member (`product.view`); cost visible only with `product.view_cost` (column omitted in cashier queries — RPC `search_products` masks it). Write: `product.manage`.

## Tests
Money parsing fixtures; unit synonyms; Edge import-preview with CSV/XLSX fixtures (good, malformed, oversized, formula cells, Hindi headers);
commit idempotency and atomicity (failure mid-way leaves no products); quota trigger; cross-shop job id rejected; ViewModel import state machine.

## Acceptance criteria
- [ ] Create/edit/archive products and categories; price change appears in history.
- [ ] Search finds "cheeni" for product "Sugar" with alias "cheeni", and Devanagari "चीनी".
- [ ] 1,000-row CSV previews with per-row errors, can be fixed and committed once; re-commit is a no-op.
- [ ] Product limit enforced server-side even when the app is bypassed.

## Limitations
No product variants (size/colour) in v1. No image per product in v1 (backlog).
