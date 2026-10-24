# Phase 03 — Product Catalogue, Categories, Units, Import

Status: **Complete — awaiting approval** · Date: 2026-10-24 · Spec: [../features/catalogue-and-imports.md](../features/catalogue-and-imports.md)

## Features implemented (end-to-end)

### 1. Product list and search
`ProductsScreen` (Items tab) → `useProductsViewModel` (300 ms debounce, category chips, `useInfiniteQuery`, 30 per page) →
`SearchProducts` → `CatalogueRepository` → `SupabaseCatalogueDataSource` → `search_products` RPC.
The RPC matches name, Hindi name, aliases and barcodes through a trigram index on `search_text`, ranks exact barcode, then prefix, then substring, then trigram-similar matches,
returns `{ items, nextOffset }`, and masks `lastCostPaise` for roles without `product.view_cost`.

### 2. Create / edit / archive a product
`ProductFormScreen` → `useProductFormViewModel` (React Hook Form; a new product's UUID v7 is generated once per form so retries
reuse it) → `SaveProduct` (`draftToInput`: rupee text → paise exactly, comma lists → barcodes/aliases, Zod `SaveProductInputSchema`
mirrors the DB checks) → `save_product` RPC. The RPC creates or fully replaces the product with its barcodes and aliases in one
transaction; triggers enforce `products.max`, write `product_price_history` on price changes and rebuild `search_text`.
`ArchiveProduct` (confirmation dialog) → `archive_product` (soft delete). Barcode conflicts return `DS_CONFLICT` → field message.

### 3. Categories
`CategoriesScreen` → `useCategoriesViewModel` → `SaveCategory` / `ArchiveCategory` → `save_category` / `archive_category`.
Names are unique per shop, case-insensitive. Archiving a category leaves its products uncategorised. Units, tax rates and categories
come together from `get_catalogue_reference` (`LoadCatalogueReference`), cached under `catalogueKeys.reference`.

### 4. CSV import (preview → review → commit)
`ImportScreen` → `useImportViewModel` (`idle → reading → review → committing → committed`).
1. **Pick and parse on the device:** `pickCsvFile` (expo-document-picker + expo-file-system) → `PreviewCsvImport`:
   `parseCsv` (BOM, quotes, `,`/`;`/tab detection) and `mapImportTable` (English/Hindi header synonyms) from `@ds/domain-core`.
   Rejects empty files, files > 5 MB of text, missing required columns (name, price) and files without rows.
2. **Stage:** `create_import_job` (idempotent by operation id; entitlement `catalogue.import`) → `stage_import_rows` in batches of 500.
   The server validates every row (`private.validate_import_row`): exact rupee → paise parsing, unit synonyms (`kilo`, `किलो`),
   tax-rate percentages, HSN, barcodes, barcode taken, duplicates in the file; matches existing products by barcode then name
   (action `update`, else `create`). Row limit `import.rows_per_job` is enforced.
3. **Review:** problem rows (read through RLS from `import_job_rows`) can be edited (name / price / unit → `update_import_row`
   revalidates and returns the new summary) or skipped. Commit stays disabled while errors remain.
4. **Commit:** `commit_product_import` creates/updates all valid rows in one transaction, re-checks the quota, marks the job
   `committed`; the ViewModel keeps one operation id per job so a repeated tap or network retry replays instead of importing twice.
   On success the route invalidates `catalogueKeys.all` so the list refreshes.

## Inventory
- **Screens / ViewModels:** Products/useProducts, ProductForm/useProductForm, Categories/useCategories, Import/useImport.
- **Use cases:** SearchProducts, GetProduct, SaveProduct, ArchiveProduct, LoadCatalogueReference, SaveCategory, ArchiveCategory,
  PreviewCsvImport, ListProblemRows, FixImportRow, SkipImportRow, CommitImport; pure: `productToDraft`, `draftToInput`, `splitList`.
- **Repository interfaces → implementations:** CatalogueRepository → CatalogueRepositoryImpl; ImportRepository → ImportRepositoryImpl.
- **Data sources:** SupabaseCatalogueDataSource, SupabaseImportDataSource; device port `CsvFileSource` → `core/files/csvFileSource`.
- **Shared code:** `@ds/domain-core` `csv.ts` (`parseCsv`, `detectDelimiter`), `productImport.ts` (`IMPORT_FIELDS`, `mapImportTable`, `chunk`);
  `@ds/contracts` `catalogue.ts` (Product, ProductPage, CatalogueReference, Unit, TaxRate, Category, SaveProductInput,
  ImportJobSummary, CommitImportOutput, `IMPORT_ROW_ERRORS`); `database.types.ts` extended with the Phase 03 tables and functions.
- **Navigation:** new Items tab; hidden routes `product` (`?id=`), `categories`, `import`, each wrapped in `RequirePermission('product.manage')`
  except the list (members can view; add/import buttons only for `product.manage`).
- **Strings:** en + hi, 245 keys each, parity checked.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261024143159_p03_catalogue` | `units`, `tax_rates` (seeded), `private.unit_synonyms`; `categories`, `products` (client-generated id), `product_barcodes` (unique per shop), `product_aliases`, `product_price_history`; `import_jobs`, `import_job_rows`; triggers for quota, price history, search text, `updated_at`; trigram index; 13 RPCs |

RPCs: get_catalogue_reference, save_category, archive_category, save_product, archive_product, search_products, get_product,
create_import_job, stage_import_rows, update_import_row, cancel_import_job, commit_product_import (+ private validation helpers).

**RLS / security:** members read catalogue tables through RLS (`rls.is_member`); `import_jobs` / `import_job_rows` readable only with
`product.manage`, as is `product_price_history`. The `last_cost_paise` column has no client column grant on `products`; cost is
returned only by the RPCs and masked without `product.view_cost`. No client
INSERT/UPDATE/DELETE grants; every write is a SECURITY DEFINER RPC with `search_path = ''` that checks membership, `product.manage`,
shop status, entitlement and quota. Cross-shop references (category of another shop, job of another shop) are rejected.
Supabase security advisor after the migration: only the expected findings listed in Phase 02.

## Tests executed (2026-10-24)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **103 / 103** (8 suites; 16 new: catalogue ViewModels/use cases/screens, import state machine, idempotent commit retry) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **26 / 26** |
| @ds/domain-core | **70 / 70** (CSV parser, header mapping, chunking, money fixtures) |
| DB pre-check (PGlite) | **139 / 139** assertions, 9 test files (new: `008_catalogue` 22, `009_import` 16) |
| DB pgTAP on real Supabase (CI `database` job) | passed for `2029ff5` and `f8559d3` ([run 40115573002](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40115573002)) |

DB tests cover: category uniqueness; create/update by the same id; price history; barcode conflict; cross-shop category rejected;
search by English name, alias "cheeni", Devanagari "चीनी" and barcode; cost masking for cashiers; cashier write denial;
archive; `products.max` quota (S-08 equivalent: limit holds even when the app is bypassed); import job idempotency, staging,
paise parsing, unit synonyms, tax mapping, name matching, every validation code, commit blocked while errors remain, fix and skip,
create + update on commit, replay with the same operation id, row limit.

**Search timing** (scratch benchmark, PGlite in WASM — slower than real Postgres — 5,000 products, 12 runs each):
"sugar" median 54 ms, "चीनी" 54 ms, "namk" 51 ms, no query 22 ms; a query that matches all 5,000 rows ("Product 4321") 121 ms.

Static checks: format ✅, typecheck (4 workspaces) ✅, lint ✅ (0 warnings), SQL fixtures current ✅, admin `next build` ✅,
Android Metro export ✅.

Bugs found by tests and fixed: `text[] || 'CODE'` parsed as an array literal ("malformed array literal") → `array_append`;
`returning *` in `UPDATE … FROM` returned joined columns → `returning j.*`; a domain-core money fixture expected 153 for
10000 @ 18 % (correct: 1525); CSV parser lint issues (literal BOM, non-null assertion).

## Acceptance criteria
- [x] Product CRUD with price history and quota enforcement.
- [~] Hindi/English/alias search under 100 ms for 5,000 products — typical queries 51–54 ms in PGlite; a query matching every
  product 121 ms in PGlite. Not yet measured on the hosted database (expected faster); revisit in Phase 13 performance work.
- [~] CSV preview → review → atomic idempotent commit — done for **CSV**. **XLSX** moves to the Phase 11 admin import workbench (ADR-032).
- [—] Import bucket policies — not applicable: files are parsed on the phone and never uploaded (ADR-032). The private bucket and
  its policy tests move to Phase 11 with XLSX.
- [x] Search finds "cheeni" / "चीनी" for "Sugar" (feature spec).
- [x] Product limit enforced server-side even when the app is bypassed (feature spec).

## Decisions (DECISIONS.md)
ADR-030 catalogue writes only through RPCs · ADR-031 client-generated product ids · ADR-032 CSV parsed on the device, XLSX in Phase 11 ·
ADR-033 import rows validated on the server · ADR-034 opening stock from import deferred to Phase 07.

## Known limitations (Phase 03)
- XLSX import, the `import-files` bucket and the `import-preview` Edge Function are deferred to Phase 11 (BL-305, BL-306).
- The `opening_stock` column is recognised but not applied; stock movements arrive in Phase 07.
- Barcode entry is typed text; camera scanning arrives with product billing (Phase 05).
- No category reordering UI (column `sort_order` exists); no import template download; no product images or variants.
- The language picker on the profile (carried from BL-209) is still in diagnostics only.
- Mobile app not run on a device/emulator in this environment; screens are covered by component tests.

## External configuration still required
Unchanged from Phase 02 — Supabase Auth on `dukaan-saathi-dev`: add `{{ .Token }}` to the "Magic Link" email template, and an SMS
provider for phone OTP (OD-02). Until then the app cannot be signed into on a device.

## Recommended next phase
Phase 04 — quick billing and transaction-safe sale creation.
