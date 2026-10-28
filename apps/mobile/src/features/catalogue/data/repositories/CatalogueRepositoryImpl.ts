import type { SaveProductInput } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { ProductQuery } from '../../domain/entities/Catalogue';
import type { CatalogueRepository } from '../../domain/repositories/CatalogueRepository';
import type { SupabaseCatalogueDataSource } from '../datasources/remote/SupabaseCatalogueDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class CatalogueRepositoryImpl implements CatalogueRepository {
  constructor(private readonly remote: SupabaseCatalogueDataSource) {}

  searchProducts = (shopId: string, query: ProductQuery) =>
    translated(() => this.remote.searchProducts(shopId, query));
  getProduct = (shopId: string, productId: string) =>
    translated(() => this.remote.getProduct(shopId, productId));
  saveProduct = (shopId: string, input: SaveProductInput) =>
    translated(() => this.remote.saveProduct(shopId, input));
  addAlias = (shopId: string, productId: string, alias: string) =>
    translated(() => this.remote.addAlias(shopId, productId, alias));
  archiveProduct = (shopId: string, productId: string) =>
    translated(() => this.remote.archiveProduct(shopId, productId));
  getReference = (shopId: string) => translated(() => this.remote.getReference(shopId));
  saveCategory = (shopId: string, c: { id: string | null; name: string; nameHi: string | null }) =>
    translated(() => this.remote.saveCategory(shopId, c));
  archiveCategory = (shopId: string, categoryId: string) =>
    translated(() => this.remote.archiveCategory(shopId, categoryId));
}
