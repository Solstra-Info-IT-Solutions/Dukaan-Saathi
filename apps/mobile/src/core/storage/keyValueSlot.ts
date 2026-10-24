import type { KeyValueStorage } from './secureStorage';

/** One named string value in storage, e.g. the last active shop id. */
export interface KeyValueSlot {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

export function createKeyValueSlot(storage: KeyValueStorage, key: string): KeyValueSlot {
  return {
    get: () => storage.getItem(key),
    set: (value) => storage.setItem(key, value),
    clear: () => storage.removeItem(key),
  };
}
