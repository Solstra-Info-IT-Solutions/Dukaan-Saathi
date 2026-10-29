import type { ConsentDto } from '@ds/contracts';

/** Published terms that this user has not accepted yet (nothing is asked before a version is published). */
export const needsConsent = (c: ConsentDto) =>
  c.currentVersion !== null && c.acceptedVersion !== c.currentVersion;
