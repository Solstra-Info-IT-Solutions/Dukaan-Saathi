import {
  CatalogueReferenceSchema,
  ProductPageSchema,
  ProductSchema,
  type SaveProductInput,
} from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { ProductQuery } from '../../../domain/entities/Catalogue';

/** One RPC per method; responses validated with the shared contracts. Errors thrown as-is. */
export class SupabaseCatalogueDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  searchProducts(shopId: string, q: ProductQuery) {
    return this.call(
      this.client.rpc('search_products', {
        p_shop_id: shopId,
        p_query: q.query,
        ...(q.categoryId ? { p_category_id: q.categoryId } : {}),
        p_limit: q.limit,
        p_offset: q.offset,
      }),
      (d) => ProductPageSchema.parse(d),
    );
  }

  getProduct(shopId: string, productId: string) {
    return this.call(this.client.rpc('get_product', { p_shop_id: shopId, p_product_id: productId }), (d) =>
      ProductSchema.parse(d),
    );
  }

  saveProduct(shopId: string, input: SaveProductInput) {
    return this.call(this.client.rpc('save_product', { p_shop_id: shopId, p_input: input }), (d) =>
      ProductSchema.parse(d),
    );
  }

  archiveProduct(shopId: string, productId: string) {
    return this.call(
      this.client.rpc('archive_product', { p_shop_id: shopId, p_product_id: productId }),
      () => {},
    );
  }

  addAlias(shopId: string, productId: string, alias: string) {
    return this.call(
      this.client.rpc('add_product_alias', { p_shop_id: shopId, p_product_id: productId, p_alias: alias }),
      () => {},
    );
  }

  getReference(shopId: string) {
    return this.call(this.client.rpc('get_catalogue_reference', { p_shop_id: shopId }), (d) =>
      CatalogueReferenceSchema.parse(d),
    );
  }

  saveCategory(shopId: string, c: { id: string | null; name: string; nameHi: string | null }) {
    return this.call(
      this.client.rpc('save_category', {
        p_shop_id: shopId,
        p_id: c.id,
        p_name: c.name,
        ...(c.nameHi ? { p_name_hi: c.nameHi } : {}),
      }),
      (d) => z.object({ id: z.uuid() }).parse(d).id,
    );
  }

  archiveCategory(shopId: string, categoryId: string) {
    return this.call(this.client.rpc('archive_category', { p_shop_id: shopId, p_id: categoryId }), () => {});
  }
}
