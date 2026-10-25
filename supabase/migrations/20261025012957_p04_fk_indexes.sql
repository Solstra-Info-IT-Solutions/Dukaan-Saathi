-- Covering indexes for foreign keys flagged by the performance advisor after Phase 03.
create index unit_synonyms_unit on private.unit_synonyms (unit_code);
create index categories_created_by on public.categories (created_by);
create index product_aliases_product on public.product_aliases (shop_id, product_id);
