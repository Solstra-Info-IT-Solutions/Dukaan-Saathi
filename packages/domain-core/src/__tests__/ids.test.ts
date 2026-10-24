import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from '../ids';

const zeros = (n: number) => new Uint8Array(n);
const ones = (n: number) => new Uint8Array(n).fill(0xff);

describe('uuidv7', () => {
  it('encodes the timestamp, version and variant', () => {
    const id = uuidv7(zeros, 0x0190_1234_5678);
    expect(id).toBe('01901234-5678-7000-8000-000000000000');
    expect(isUuid(id)).toBe(true);
  });
  it('keeps random bits but forces version and variant', () => {
    const id = uuidv7(ones, 0);
    expect(id).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });
  it('sorts by creation time', () => {
    const a = uuidv7(ones, 1_700_000_000_000);
    const b = uuidv7(zeros, 1_700_000_000_001);
    expect(a < b).toBe(true);
  });
  it('rejects bad inputs', () => {
    expect(() => uuidv7(() => new Uint8Array(4), 0)).toThrow(RangeError);
    expect(() => uuidv7(zeros, -1)).toThrow(RangeError);
  });
});
