/** TanStack Query keys for the catalogue. Invalidate `all(shopId)` after any catalogue write. */
export const catalogueKeys = {
  all: (shopId: string) => ['catalogue', shopId] as const,
  reference: (shopId: string) => ['catalogue', shopId, 'reference'] as const,
  search: (shopId: string, query: string, categoryId: string | null) =>
    ['catalogue', shopId, 'search', query, categoryId] as const,
  product: (shopId: string, productId: string) => ['catalogue', shopId, 'product', productId] as const,
};
