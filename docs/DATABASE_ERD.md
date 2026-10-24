# Database ERD

Diagrams are split by domain. Every tenant table carries `shop_id` (omitted from relationship lines for readability).

## 1. Identity, tenancy, devices

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "1:1"
  PROFILES ||--o{ SHOP_MEMBERS : "is member"
  SHOPS ||--o{ SHOP_MEMBERS : has
  SHOPS ||--|| SHOP_SETTINGS : has
  SHOPS ||--o{ SHOP_INVITATIONS : issues
  SHOPS ||--o{ SHOP_DEVICES : registers
  PROFILES ||--o{ SHOP_DEVICES : "registered by"
  SHOP_DEVICES ||--o{ INVOICE_SERIES : "one per FY"
  ROLE_PERMISSIONS }o--|| SHOP_MEMBERS : "role → permissions"
  PROFILES ||--o| PLATFORM_ADMINS : "may be"

  SHOPS {
    uuid id PK
    text name
    text business_category
    text status
    text timezone
  }
  SHOP_MEMBERS {
    uuid shop_id FK
    uuid user_id FK
    text role
    text status
  }
  SHOP_DEVICES {
    uuid id PK
    uuid shop_id FK
    text device_code
    text status
  }
  INVOICE_SERIES {
    uuid shop_id FK
    uuid device_id FK
    text fy
    bigint last_seq
  }
```

## 2. Catalogue and imports

```mermaid
erDiagram
  SHOPS ||--o{ CATEGORIES : owns
  CATEGORIES ||--o{ PRODUCTS : groups
  UNITS ||--o{ PRODUCTS : measures
  TAX_RATES ||--o{ PRODUCTS : "rate code"
  PRODUCTS ||--o{ PRODUCT_BARCODES : has
  PRODUCTS ||--o{ PRODUCT_ALIASES : has
  PRODUCTS ||--o{ PRODUCT_PRICE_HISTORY : "price changes"
  SHOPS ||--o{ IMPORT_JOBS : runs
  IMPORT_JOBS ||--o{ IMPORT_JOB_ROWS : stages
  ONBOARDING_REQUESTS ||--o{ IMPORT_JOBS : "may create"

  PRODUCTS {
    uuid id PK
    uuid shop_id FK
    text name
    bigint price_paise
    text unit_code
    bigint stock_on_hand_milli
    boolean track_stock
  }
```

## 3. Sales, payments, stock

```mermaid
erDiagram
  SALES ||--|{ SALE_ITEMS : contains
  SALES ||--o{ SALE_PAYMENTS : "paid by"
  SALES ||--o{ SALE_RETURNS : "returned via"
  SALE_RETURNS ||--|{ SALE_RETURN_ITEMS : contains
  SALE_ITEMS }o--o| PRODUCTS : "snapshot of"
  SALES }o--o| CUSTOMERS : "billed to"
  SALES }o--|| SHOP_DEVICES : "numbered by"
  PRODUCTS ||--o{ STOCK_MOVEMENTS : ledger
  SALE_ITEMS ||--o{ STOCK_MOVEMENTS : "causes"
  PURCHASE_ITEMS ||--o{ STOCK_MOVEMENTS : "causes"

  SALES {
    uuid id PK
    uuid shop_id FK
    uuid device_id FK
    text fy
    bigint seq
    text status
    bigint total_paise
    uuid client_operation_id
  }
  STOCK_MOVEMENTS {
    uuid id PK
    uuid product_id FK
    text movement_type
    bigint delta_milli
    text source_type
    uuid source_id
  }
```

## 4. Customers, suppliers, purchases, expenses

```mermaid
erDiagram
  CUSTOMERS ||--o{ CUSTOMER_LEDGER_ENTRIES : ledger
  SALES ||--o{ CUSTOMER_LEDGER_ENTRIES : "udhaar debit / void credit"
  SUPPLIERS ||--o{ PURCHASES : supplies
  PURCHASES ||--|{ PURCHASE_ITEMS : contains
  SUPPLIERS ||--o{ SUPPLIER_LEDGER_ENTRIES : ledger
  PURCHASES ||--o{ SUPPLIER_LEDGER_ENTRIES : "payable"
  EXPENSE_CATEGORIES ||--o{ EXPENSES : classifies
  SHOPS ||--o{ DAY_CLOSURES : "one per business date per device"

  CUSTOMER_LEDGER_ENTRIES {
    uuid id PK
    uuid customer_id FK
    text entry_type
    bigint amount_paise
    uuid source_id
  }
```

## 5. Subscriptions, entitlements, feature flags, config

```mermaid
erDiagram
  SUBSCRIPTION_PLANS ||--o{ PLAN_ENTITLEMENTS : grants
  ENTITLEMENT_DEFINITIONS ||--o{ PLAN_ENTITLEMENTS : "typed by"
  ENTITLEMENT_DEFINITIONS ||--o{ SHOP_ENTITLEMENT_OVERRIDES : "typed by"
  SHOPS ||--o{ SHOP_SUBSCRIPTIONS : "history"
  SUBSCRIPTION_PLANS ||--o{ SHOP_SUBSCRIPTIONS : "plan of"
  SHOPS ||--o{ SHOP_ENTITLEMENT_OVERRIDES : "overrides"
  SHOP_SUBSCRIPTIONS ||--o{ SUBSCRIPTION_EVENTS : "events"
  FEATURE_FLAGS ||--o{ FEATURE_FLAG_OVERRIDES : "per shop"
  PLATFORM_CONFIG ||--o{ CONFIG_REVISIONS : "versioned"
  SHOPS ||--o{ USAGE_COUNTERS : meters
```

## 6. Operations: sync, notifications, support, audit

```mermaid
erDiagram
  SHOP_DEVICES ||--o{ SYNC_BATCHES : pushes
  SYNC_BATCHES ||--|{ SYNC_OPERATION_RESULTS : "per op"
  SHOP_DEVICES ||--o{ PUSH_TOKENS : has
  SHOPS ||--o{ NOTIFICATIONS : receives
  NOTIFICATION_TEMPLATES ||--o{ NOTIFICATIONS : renders
  SHOPS ||--o{ SUPPORT_TICKETS : opens
  SUPPORT_TICKETS ||--o{ SUPPORT_TICKET_MESSAGES : thread
  SHOPS ||--o{ ONBOARDING_REQUESTS : requests
  AUDIT_EVENTS }o--o| SHOPS : "about"
```
