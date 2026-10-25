/** TanStack Query keys for billing. */
export const billingKeys = {
  all: (shopId: string) => ['billing', shopId] as const,
  settings: (shopId: string) => ['billing', shopId, 'settings'] as const,
  sale: (shopId: string, saleId: string) => ['billing', shopId, 'sale', saleId] as const,
};
