import type { KeyValueStorage } from './secureStorage';
import { toSecureKey } from './secureStorage';

/**
 * Last invoice number used by this phone per series (shop, device, financial year).
 * SecureStore in Phase 04; moves to SQLite with the outbox in Phase 09 (features/billing.md).
 */
export interface InvoiceCounterStorage {
  last(seriesKey: string): Promise<number | null>;
  save(seriesKey: string, seq: number): Promise<void>;
}

export function createInvoiceCounterStore(storage: KeyValueStorage): InvoiceCounterStorage {
  const keyOf = (seriesKey: string) => toSecureKey(`ds.invoice_seq.${seriesKey}`);
  return {
    async last(seriesKey) {
      const value = await storage.getItem(keyOf(seriesKey));
      const n = value === null ? NaN : Number(value);
      return Number.isSafeInteger(n) && n >= 0 ? n : null;
    },
    save: (seriesKey, seq) => storage.setItem(keyOf(seriesKey), String(seq)),
  };
}
