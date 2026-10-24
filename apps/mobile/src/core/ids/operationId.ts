import { uuidv7 } from '@ds/domain-core';
import * as Crypto from 'expo-crypto';

/** Client operation ids for idempotent writes (API_AND_RPC_CONTRACTS.md §3). */
export type IdFactory = () => string;

export const newOperationId: IdFactory = () => uuidv7((n) => Crypto.getRandomBytes(n));
