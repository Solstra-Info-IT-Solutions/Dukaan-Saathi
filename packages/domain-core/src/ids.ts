/**
 * UUID v7 (RFC 9562): 48-bit Unix-ms timestamp + random bits. Time-ordered, so ids created offline
 * sort by creation time (SYSTEM_ARCHITECTURE.md §6). Randomness is injected so this stays platform-free;
 * the app passes expo-crypto's getRandomBytes.
 */
export function uuidv7(randomBytes: (length: number) => Uint8Array, nowMs: number = Date.now()): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid timestamp');
  const bytes = randomBytes(16);
  if (bytes.length !== 16) throw new RangeError('randomBytes must return 16 bytes');
  const b = Uint8Array.from(bytes);
  let ts = nowMs;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70; // version 7
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
