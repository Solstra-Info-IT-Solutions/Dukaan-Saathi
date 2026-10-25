-- Covering indexes for (shop_id, device_id) foreign keys flagged by the performance advisor.
create index expenses_device on public.expenses (shop_id, device_id) where device_id is not null;
create index purchases_device on public.purchases (shop_id, device_id) where device_id is not null;
create index sale_returns_device on public.sale_returns (shop_id, device_id);
create index supplier_ledger_device on public.supplier_ledger_entries (shop_id, device_id) where device_id is not null;
