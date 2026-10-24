/** Form input rejected before calling the server. `fields` maps a field name to an issue code. */
export class ShopInputError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('ShopInputError');
    this.name = 'ShopInputError';
  }
}
