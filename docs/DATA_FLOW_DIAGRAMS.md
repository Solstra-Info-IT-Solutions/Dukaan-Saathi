# Data Flow Diagrams

Diagrams must match the code. When a flow changes, update the diagram in the same PR.
Other diagrams: system architecture (SYSTEM_ARCHITECTURE.md §1), MVVM layers (MVVM_ARCHITECTURE.md §1),
offline write path (OFFLINE_SYNC_DESIGN.md §3), entitlement resolution and config refresh (FEATURE_CONFIGURATION.md §4, §7).

## 1. Repository / data-source flow (read with cache)

```mermaid
sequenceDiagram
  participant Screen as ProductsScreen
  participant VM as useProductsViewModel
  participant Q as TanStack Query
  participant UC as SearchProducts
  participant R as CatalogueRepositoryImpl
  participant RDS as SupabaseCatalogueDataSource
  participant DB as PostgreSQL (RLS)
  Screen->>VM: onSearch("chini")
  VM->>Q: useInfiniteQuery(catalogueKeys.search(shopId,"chini"))
  Q->>UC: execute({shopId, query, cursor})
  UC->>R: searchProducts(shopId, query, page)
  R->>RDS: rpc('search_products', {...})
  RDS->>DB: select … where shop_id = $1 (policy: is_member)
  DB-->>RDS: rows (DTO)
  RDS-->>R: ProductDto[] (Zod-validated)
  R-->>UC: Page<ProductSummary> (mapped)
  UC-->>Q: Page
  Q-->>VM: data / status
  VM-->>Screen: state {status:'loaded', items}
```

## 2. Authentication and tenant authorization

```mermaid
sequenceDiagram
  participant App
  participant Auth as Supabase Auth
  participant RPC as get_my_context / any RPC
  participant H as private.require_member
  App->>Auth: signInWithOtp(phone) → verifyOtp(code)
  Auth-->>App: session (JWT: sub = user id)
  App->>RPC: get_my_context()
  RPC-->>App: memberships [{shop, role, permissions}], invitations
  App->>App: sessionStore.activeShop = chosen shop
  App->>RPC: create_sale({shop_id, …}) with JWT
  RPC->>H: require_member(shop_id, 'sale.create')
  H->>H: auth.uid() → shop_members (active) → role_permissions → shop.status
  alt allowed
    H-->>RPC: ok
  else
    H-->>App: DS_NOT_A_MEMBER / DS_PERMISSION_DENIED / DS_SHOP_SUSPENDED
  end
```

Role/permission are **looked up per request**, never read from JWT claims, so deactivation is immediate.

## 3. Sale creation transaction (`create_sale`)

```mermaid
flowchart TD
  A[RPC call with JWT] --> B[require_member sale.create<br/>device active, app version ok]
  B --> C{idempotency key exists?}
  C -- same hash --> R1[return stored result<br/>replayed=true]
  C -- different hash --> X1[DS_IDEMPOTENCY_CONFLICT]
  C -- no --> D[lock products FOR SHARE<br/>load prices, tax, cost]
  D --> E[price + discount policy<br/>by role and settings]
  E --> F[compute totals in SQL<br/>compare client_totals]
  F --> G[validate payments + udhaar<br/>customer, credit policy]
  G --> H[insert sales with fy/seq<br/>unique per device series]
  H --> I[insert sale_items snapshots<br/>+ sale_payments]
  I --> J[stock_movements + update<br/>products.stock_on_hand]
  J --> K[customer_ledger debit + update<br/>customers.balance]
  K --> L[audit overrides/discounts<br/>store idempotency result]
  L --> M[COMMIT → output]
  E -. violation online .-> X2[DS_* error, ROLLBACK]
  F -. mismatch online .-> X2
  G -. violation online .-> X2
```

For `origin = offline_sync`, policy violations in E/F/G become `needs_review` reasons instead of errors (ADR-012).

## 4. Managed onboarding

```mermaid
sequenceDiagram
  participant Owner as Owner (app)
  participant ST as Storage (private)
  participant DB as Postgres
  participant Op as Operator (admin)
  participant EF as import-preview (Edge)
  Owner->>ST: upload Excel/photos to onboarding-uploads/{shop}/{req}
  Owner->>DB: create_onboarding_request(method, paths)
  DB-->>Op: appears in onboarding queue
  Op->>DB: admin_update_onboarding(assign, in_progress)
  Op->>ST: (photos) transcribe into template CSV, upload to import-files/{shop}/{job}
  Op->>DB: admin_create_import_job(shop, request, path)
  Op->>EF: preview(job)
  EF->>ST: read file (service role, path checked against job)
  EF->>DB: insert import_job_rows (normalized + errors)
  Op->>DB: fix rows, status awaiting_owner
  DB-->>Owner: push "Your products are ready to review"
  Owner->>DB: review in app → commit_product_import(job, op_id)
  DB->>DB: one txn: upsert products, barcodes, aliases, opening stock movements
  DB-->>Owner: committed (counts)
```

## 5. Subscription event processing (Phase 12)

```mermaid
sequenceDiagram
  participant P as Payment provider
  participant W as payments-webhook (Edge)
  participant DB as Postgres
  P->>W: POST event + signature
  W->>W: verify HMAC with webhook secret; reject if invalid
  W->>DB: process_verified_subscription_event(event) [service_role]
  DB->>DB: unique provider_event_id (replay-safe)<br/>update shop_subscriptions, audit
  DB-->>W: result
  W-->>P: 200
```
