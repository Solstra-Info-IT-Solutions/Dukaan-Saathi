-- Phase 10: voice billing learns aliases (features/voice-billing.md "LearnAlias").
-- When a shopkeeper corrects what voice matched, the words they said become an alias of the chosen item, so the
-- next time the same words match directly. Speech and audio never reach the server; only the alias text does.

create or replace function public.add_product_alias(p_shop_id uuid, p_product_id uuid, p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text := lower(btrim(regexp_replace(coalesce(p_alias, ''), '\s+', ' ', 'g')));
  v_added boolean := false;
begin
  perform private.require_member(p_shop_id, 'product.manage');
  if char_length(v_alias) not between 2 and 60 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"alias"}');
  end if;
  if not exists (select 1 from public.products where shop_id = p_shop_id and id = p_product_id and archived_at is null) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  -- Already the item's name or an alias: nothing to learn.
  if not exists (select 1 from public.products where id = p_product_id and (lower(name) = v_alias or lower(name_hi) = v_alias))
     and not exists (select 1 from public.product_aliases where product_id = p_product_id and lower(alias) = v_alias) then
    insert into public.product_aliases (shop_id, product_id, alias, source)
    values (p_shop_id, p_product_id, v_alias, 'voice_learned');
    -- Also refreshes the search text and updated_at, so phones pick the alias up with the next sync.
    perform private.refresh_product_search_text(p_product_id);
    v_added := true;
  end if;
  return jsonb_build_object(
    'productId', p_product_id,
    'added', v_added,
    'aliases', coalesce((select jsonb_agg(a.alias order by a.created_at) from public.product_aliases a
                          where a.product_id = p_product_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.add_product_alias(uuid, uuid, text) from public, anon;
grant execute on function public.add_product_alias(uuid, uuid, text) to authenticated;
