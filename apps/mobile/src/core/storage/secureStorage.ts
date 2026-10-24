import * as SecureStore from 'expo-secure-store';

/**
 * Key-value storage backed by the OS keystore (expo-secure-store).
 * SecureStore values should stay small, but a Supabase session can exceed 2 KB, so values are split
 * into chunks: `<key>` holds the chunk count, `<key>.0..n` hold the parts.
 * Implements the `storage` interface expected by supabase-js.
 */

export const CHUNK_SIZE = 1800;

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
export function toSecureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export function createChunkedSecureStorage(store: SecureStoreLike = SecureStore): KeyValueStorage {
  async function removeChunks(base: string): Promise<void> {
    const countText = await store.getItemAsync(base);
    const count = countText ? Number(countText) : 0;
    for (let i = 0; i < count; i++) await store.deleteItemAsync(`${base}.${i}`);
    await store.deleteItemAsync(base);
  }

  return {
    async getItem(key) {
      const base = toSecureKey(key);
      const countText = await store.getItemAsync(base);
      if (countText === null) return null;
      const count = Number(countText);
      if (!Number.isInteger(count) || count < 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await store.getItemAsync(`${base}.${i}`);
        if (part === null) return null; // partial write — treat as missing rather than corrupt data
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const base = toSecureKey(key);
      await removeChunks(base);
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < count; i++) {
        await store.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Count written last: a crash mid-write leaves no count, so the value reads as absent.
      await store.setItemAsync(base, String(count));
    },
    async removeItem(key) {
      await removeChunks(toSecureKey(key));
    },
  };
}
