import { parseEnv } from '../config/env';
import { toOnline } from '../connectivity/connectivity';
import { AppError } from '../errors/AppError';
import { translateError } from '../errors/translateError';
import { scrub } from '../logging/logger';
import {
  CHUNK_SIZE,
  createChunkedSecureStorage,
  type SecureStoreLike,
  toSecureKey,
} from '../storage/secureStorage';

describe('parseEnv', () => {
  it('runs without a backend when Supabase vars are empty', () => {
    const env = parseEnv({
      EXPO_PUBLIC_APP_ENV: 'development',
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    });
    expect(env.backend).toBeNull();
    expect(env.issues).toEqual([]);
  });
  it('configures the backend when both vars are present', () => {
    const env = parseEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
    });
    expect(env.backend).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' });
  });
  it('reports a half-configured backend', () => {
    const env = parseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' });
    expect(env.backend).toBeNull();
    expect(env.issues).toHaveLength(1);
  });
  it('refuses a secret key in the public bundle', () => {
    const env = parseEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_123',
    });
    expect(env.backend).toBeNull();
    expect(env.issues[0]).toMatch(/secret/);
  });
  it('reports an invalid app env instead of crashing', () => {
    const env = parseEnv({ EXPO_PUBLIC_APP_ENV: 'prod' });
    expect(env.appEnv).toBe('development');
    expect(env.issues.length).toBeGreaterThan(0);
  });
});

describe('translateError', () => {
  it('maps DS_* codes raised by SQL with JSON details', () => {
    const e = translateError({
      message: 'DS_QUOTA_EXCEEDED',
      code: 'P0001',
      details: '{"key":"products.max","limit":100}',
    });
    expect(e.code).toBe('DS_QUOTA_EXCEEDED');
    expect(e.details).toEqual({ key: 'products.max', limit: 100 });
    expect(e.messageKey).toBe('errors.DS_QUOTA_EXCEEDED');
    expect(e.retryable).toBe(false);
  });
  it.each([
    [{ code: '42501', message: 'permission denied for table sales' }, 'DS_PERMISSION_DENIED'],
    [{ code: '23505', message: 'duplicate key' }, 'DS_CONFLICT'],
    [{ code: 'PGRST116', message: 'no rows' }, 'DS_NOT_FOUND'],
    [new TypeError('Network request failed'), 'NETWORK_OFFLINE'],
    [{ name: 'AbortError', message: 'aborted' }, 'NETWORK_TIMEOUT'],
    [new Error('boom'), 'UNKNOWN'],
    [undefined, 'UNKNOWN'],
  ])('%o → %s', (input, code) => {
    expect(translateError(input).code).toBe(code);
  });
  it('never exposes the raw backend message', () => {
    const e = translateError({ code: '42501', message: 'permission denied for table sales' });
    expect(e.message).toBe('DS_PERMISSION_DENIED');
  });
  it('passes AppErrors through unchanged', () => {
    const original = new AppError('DS_NOT_FOUND');
    expect(translateError(original)).toBe(original);
  });
  it('marks network errors retryable', () => {
    expect(translateError(new TypeError('Network request failed')).retryable).toBe(true);
  });
});

describe('chunked secure storage', () => {
  function memoryStore(): SecureStoreLike & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItemAsync: async (k) => data.get(k) ?? null,
      setItemAsync: async (k, v) => {
        data.set(k, v);
      },
      deleteItemAsync: async (k) => {
        data.delete(k);
      },
    };
  }

  it('round-trips values larger than one chunk', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 10);
    await storage.setItem('sb-abc-auth-token', value);
    expect(await storage.getItem('sb-abc-auth-token')).toBe(value);
    expect(store.data.get('sb-abc-auth-token')).toBe('3');
  });
  it('removes stale chunks when a value shrinks', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem('k', 'y'.repeat(CHUNK_SIZE * 3));
    await storage.setItem('k', 'short');
    expect(await storage.getItem('k')).toBe('short');
    expect([...store.data.keys()].sort()).toEqual(['k', 'k.0']);
  });
  it('treats a partially written value as missing', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem('k', 'z'.repeat(CHUNK_SIZE + 1));
    store.data.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });
  it('removes all chunks', async () => {
    const store = memoryStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem('k', 'z'.repeat(CHUNK_SIZE + 1));
    await storage.removeItem('k');
    expect(store.data.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });
  it('sanitises keys for SecureStore', () => {
    expect(toSecureKey('sb-abc-auth-token:code/verifier')).toBe('sb-abc-auth-token_code_verifier');
  });
});

describe('logger scrubbing', () => {
  it('redacts secrets and phone numbers', () => {
    expect(
      scrub({ accessToken: 'abc', phone: '+919876543210', nested: { note: 'call 9876543210' }, amount: 500 }),
    ).toEqual({
      accessToken: '[redacted]',
      phone: '[phone]',
      nested: { note: 'call [phone]' },
      amount: 500,
    });
  });
});

describe('toOnline', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: true, isInternetReachable: false }, false],
    [{ isConnected: false, isInternetReachable: null }, false],
    [{ isConnected: null, isInternetReachable: null }, false],
  ])('%o → %s', (state, expected) => {
    expect(toOnline(state)).toBe(expected);
  });
});
