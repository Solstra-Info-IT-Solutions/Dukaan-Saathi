/** TanStack Query keys for the shops feature. */
export const shopKeys = {
  context: () => ['shops', 'context'] as const,
  settings: (shopId: string) => ['shops', shopId, 'settings'] as const,
  entitlements: (shopId: string) => ['shops', shopId, 'entitlements'] as const,
};
