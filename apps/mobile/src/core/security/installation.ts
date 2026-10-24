import * as Crypto from 'expo-crypto';
import type { KeyValueStorage } from '../storage/secureStorage';

const INSTALLATION_KEY = 'ds.installation_id';

/**
 * A random id created once per app install and kept in SecureStore. The server maps it to a device
 * of each shop (register_device), which gives the device its invoice series (ADR-008).
 * A reinstall creates a new id, i.e. a new device code — by design.
 */
export function createInstallationIdStore(
  storage: KeyValueStorage,
  randomUUID: () => string = Crypto.randomUUID,
) {
  let cached: string | null = null;
  return {
    async get(): Promise<string> {
      if (cached) return cached;
      const existing = await storage.getItem(INSTALLATION_KEY);
      if (existing) {
        cached = existing;
        return existing;
      }
      const created = randomUUID();
      await storage.setItem(INSTALLATION_KEY, created);
      cached = created;
      return created;
    },
  };
}

export type InstallationIdStore = ReturnType<typeof createInstallationIdStore>;
