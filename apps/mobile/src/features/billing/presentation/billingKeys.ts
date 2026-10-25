/** TanStack Query keys for billing. */
export const billingKeys = {
  all: (shopId: string) => ['billing', shopId] as const,
  settings: (shopId: string) => ['billing', shopId, 'settings'] as const,
  reference: (shopId: string) => ['billing', shopId, 'reference'] as const,
  search: (shopId: string, text: string) => ['billing', shopId, 'search', text] as const,
  sale: (shopId: string, saleId: string) => ['billing', shopId, 'sale', saleId] as const,
  sales: (shopId: string, filter: unknown) => ['billing', shopId, 'sales', filter] as const,
};
