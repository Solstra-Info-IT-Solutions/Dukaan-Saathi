import { phoneticKey, tokenize } from './normalize';
import type { ParsedPhrase, SpokenUnit } from './parser';

/** What matching needs from a catalogue item. */
export interface VoiceProduct {
  id: string;
  name: string;
  nameHi: string | null;
  aliases: string[];
  unitCode: string;
  pricePaise: number;
}

/** Confidence at or above which a line is taken as is; below CHECK the phrase is unmatched. */
export const MATCH_OK = 0.85;
export const MATCH_CHECK = 0.6;

const SIZE_TOKEN = /^\d+(\.\d+)?$|^(kg|g|gm|ml|l|ltr|pc|pcs|pkt)$/;

const keys = (text: string) =>
  tokenize(text)
    .filter((t) => !SIZE_TOKEN.test(t) && t !== ',')
    .map(phoneticKey)
    .filter(Boolean);

/** 1 − edit distance / length, on phonetic keys. */
export function similarity(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

/** How well spoken item words fit one name or alias (0..1). */
export function nameScore(spoken: string, name: string): number {
  const p = keys(spoken);
  const c = keys(name);
  if (p.length === 0 || c.length === 0) return 0;
  const pj = p.join('');
  const cj = c.join('');
  if (pj === cj) return 1;
  const whole = similarity(pj, cj);
  // Every spoken word against its best name word ("maggi" ↔ "Maggi Masala Noodles"), a little less when the
  // name has many more words than were spoken.
  const perWord = p.reduce((sum, w) => sum + Math.max(...c.map((x) => similarity(w, x))), 0) / p.length;
  const coverage = 0.88 + 0.12 * Math.min(1, p.length / c.length);
  const prefix = pj.length >= 3 && cj.startsWith(pj) ? 0.88 : 0;
  return Math.max(whole, perWord * coverage, prefix);
}

export interface Match<T> {
  product: T | null;
  confidence: number;
  /** Next best items, for "did you mean". */
  alternatives: T[];
  /** Two items scored almost the same. */
  ambiguous: boolean;
}

/** Best item for the spoken words, over name, Hindi name and aliases (learned aliases count fully). */
export function matchItem<T extends VoiceProduct>(spoken: string, products: readonly T[]): Match<T> {
  const scored = products
    .map((p) => ({
      p,
      s: Math.max(
        nameScore(spoken, p.name),
        p.nameHi ? nameScore(spoken, p.nameHi) : 0,
        ...p.aliases.map((a) => nameScore(spoken, a)),
      ),
    }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best || best.s < MATCH_CHECK) {
    return {
      product: null,
      confidence: best?.s ?? 0,
      alternatives: scored
        .slice(0, 3)
        .filter((x) => x.s > 0.3)
        .map((x) => x.p),
      ambiguous: false,
    };
  }
  const second = scored[1];
  return {
    product: best.p,
    confidence: best.s,
    alternatives: scored
      .slice(1, 4)
      .filter((x) => x.s >= MATCH_CHECK - 0.1)
      .map((x) => x.p),
    ambiguous: !!second && best.s < 1 && best.s - second.s < 0.04,
  };
}

const MASS: Partial<Record<SpokenUnit | string, number>> = { kg: 1000, g: 1 };
const VOLUME: Partial<Record<SpokenUnit | string, number>> = { l: 1000, ml: 1 };
const COUNT: Partial<Record<SpokenUnit | string, number>> = { pc: 1, pkt: 1, box: 1, dozen: 12 };

/**
 * Spoken quantity → milli-units of the item's unit. "500 gram" of a kg item = 500; "2 kg" = 2000; "1 dozen" of a
 * piece item = 12000; no unit = the item's own unit. `mismatch` when the units cannot be converted (e.g. "2 kilo"
 * of a piece item): the number is then taken in the item's unit and the line is marked for checking.
 */
export function toQuantityMilli(
  quantity: number,
  spoken: SpokenUnit | null,
  itemUnit: string,
): { milli: number; mismatch: boolean } {
  const same = (table: Partial<Record<string, number>>) =>
    table[itemUnit] !== undefined && spoken !== null && table[spoken] !== undefined;
  if (spoken === null || spoken === itemUnit) return { milli: Math.round(quantity * 1000), mismatch: false };
  for (const table of [MASS, VOLUME, COUNT]) {
    if (same(table))
      return { milli: Math.round((quantity * table[spoken!]! * 1000) / table[itemUnit]!), mismatch: false };
  }
  // "paav doodh": a quarter of the item's unit when the parser assumed kilos for a litre item.
  if (spoken === 'kg' && VOLUME[itemUnit] !== undefined) {
    return { milli: Math.round((quantity * 1000 * 1000) / VOLUME[itemUnit]!), mismatch: false };
  }
  return { milli: Math.round(quantity * 1000), mismatch: true };
}

export type VoiceLineStatus = 'ok' | 'check' | 'unmatched';
export type VoiceIssue = 'low_confidence' | 'ambiguous' | 'unit_mismatch' | 'whole_units' | 'no_quantity';

export interface VoiceLine<T extends VoiceProduct = VoiceProduct> {
  key: string;
  phrase: ParsedPhrase;
  product: T | null;
  /** Milli-units of the item's unit, or null for an amount-based line. */
  quantityMilli: number | null;
  /** "₹50 worth"; the billing screen turns it into a quantity at the item's price. */
  amountPaise: number | null;
  confidence: number;
  status: VoiceLineStatus;
  issues: VoiceIssue[];
  alternatives: T[];
}

/** Matched, converted draft lines; nothing here is billed until the user confirms (features/voice-billing.md). */
export function buildVoiceDraft<T extends VoiceProduct>(
  phrases: readonly ParsedPhrase[],
  products: readonly T[],
  allowsFraction: (unitCode: string) => boolean,
  newKey: () => string,
): VoiceLine<T>[] {
  return phrases.map((phrase) => {
    const m = matchItem(phrase.itemText, products);
    const issues: VoiceIssue[] = [];
    let quantityMilli: number | null = null;
    if (m.product && phrase.amountPaise === null) {
      const q = toQuantityMilli(phrase.quantity ?? 1, phrase.unit, m.product.unitCode);
      quantityMilli = q.milli;
      if (q.mismatch) issues.push('unit_mismatch');
      if (!allowsFraction(m.product.unitCode) && quantityMilli % 1000 !== 0) {
        quantityMilli = Math.max(1000, Math.round(quantityMilli / 1000) * 1000);
        issues.push('whole_units');
      }
      if (quantityMilli <= 0) issues.push('no_quantity');
    }
    if (m.product && m.confidence < MATCH_OK) issues.push('low_confidence');
    if (m.ambiguous) issues.push('ambiguous');
    return {
      key: newKey(),
      phrase,
      product: m.product,
      quantityMilli,
      amountPaise: phrase.amountPaise,
      confidence: m.confidence,
      status: !m.product ? 'unmatched' : issues.length ? 'check' : 'ok',
      issues,
      alternatives: m.alternatives,
    };
  });
}

/** The line after the user picked an item for it (quantity converted again; it counts as checked). */
export function withProduct<T extends VoiceProduct>(
  line: VoiceLine<T>,
  product: T,
  allowsFraction: (unitCode: string) => boolean,
): VoiceLine<T> {
  let quantityMilli: number | null = null;
  const issues: VoiceIssue[] = [];
  if (line.amountPaise === null) {
    const q = toQuantityMilli(line.phrase.quantity ?? 1, line.phrase.unit, product.unitCode);
    quantityMilli = q.milli;
    if (!allowsFraction(product.unitCode) && quantityMilli % 1000 !== 0) {
      quantityMilli = Math.max(1000, Math.round(quantityMilli / 1000) * 1000);
      issues.push('whole_units');
    }
  }
  return { ...line, product, quantityMilli, confidence: 1, status: 'ok', issues, alternatives: [] };
}
