import type { SaveProductInput } from '@ds/contracts';
import type { CatalogueReference, Product, ProductPage, ProductQuery } from '../entities/Catalogue';

export interface CatalogueRepository {
  searchProducts(shopId: string, query: ProductQuery): Promise<ProductPage>;
  getProduct(shopId: string, productId: string): Promise<Product>;
  saveProduct(shopId: string, input: SaveProductInput): Promise<Product>;
  archiveProduct(shopId: string, productId: string): Promise<void>;
  /** Phase 10: what was said for an item becomes an alias (`add_product_alias`, product.manage). */
  addAlias(shopId: string, productId: string, alias: string): Promise<void>;
  getReference(shopId: string): Promise<CatalogueReference>;
  saveCategory(
    shopId: string,
    category: { id: string | null; name: string; nameHi: string | null },
  ): Promise<string>;
  archiveCategory(shopId: string, categoryId: string): Promise<void>;
}
