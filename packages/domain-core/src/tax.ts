import { type BasisPoints, type Paise, paise, roundHalfUpDiv } from './money';

/**
 * Tax contained in a tax-inclusive amount (BR-05):
 *   tax = round_half_up(amount × rate / (10000 + rate))   with rate in basis points.
 * Mirrored by private.tax_from_inclusive in SQL.
 */
export function taxFromInclusive(amountPaise: Paise, rateBp: BasisPoints): Paise {
  if (rateBp === 0) return paise(0);
  return paise(roundHalfUpDiv(BigInt(amountPaise) * BigInt(rateBp), 10_000n + BigInt(rateBp)));
}

/** Splits intra-state GST equally into CGST and SGST; an odd paisa goes to CGST. */
export function splitCgstSgst(taxPaise: Paise): { cgstPaise: Paise; sgstPaise: Paise } {
  const sgst = Math.floor(taxPaise / 2);
  return { cgstPaise: paise(taxPaise - sgst), sgstPaise: paise(sgst) };
}
