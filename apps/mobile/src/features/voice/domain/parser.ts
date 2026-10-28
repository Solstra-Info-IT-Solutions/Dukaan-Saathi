import { numberKey, readNumber, tokenize } from './normalize';

/** Units as spoken; mapped to the item's own unit later. */
export type SpokenUnit = 'kg' | 'g' | 'l' | 'ml' | 'pc' | 'pkt' | 'box' | 'dozen';

/** One item of an utterance, before matching (features/voice-billing.md "Grammar parser"). */
export interface ParsedPhrase {
  /** The words of this phrase, for display and corrections. */
  raw: string;
  /** Words naming the item. */
  itemText: string;
  quantity: number | null;
  unit: SpokenUnit | null;
  /** "pachaas rupaye ka dhaniya": an amount-based loose line. */
  amountPaise: number | null;
}

const UNIT_WORDS: Record<string, SpokenUnit> = {};
const unit = (u: SpokenUnit, ...words: string[]) => words.forEach((w) => (UNIT_WORDS[numberKey(w)] = u));
unit('kg', 'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kelo', 'किलो');
unit('g', 'g', 'gm', 'gms', 'gram', 'grams', 'gramm', 'ग्राम');
unit('l', 'l', 'ltr', 'litre', 'liter', 'litres', 'liters', 'litar', 'लीटर');
unit('ml', 'ml', 'millilitre', 'milliliter', 'mililitar');
unit('pc', 'pc', 'pcs', 'piece', 'pieces', 'pees', 'nag', 'नग', 'पीस');
unit('pkt', 'packet', 'packets', 'pkt', 'paket', 'packit', 'पैकेट', 'pouch');
unit('box', 'box', 'dabba', 'dibba', 'डिब्बा');
unit('dozen', 'dozen', 'darjan', 'darjen', 'दर्जन');

const AMOUNT_WORDS = new Set(
  ['rupaye', 'rupay', 'rupee', 'rupees', 'rs', 'rupaiya', 'rupiya', 'rupae', 'rupye'].map(numberKey),
);
const LINK_WORDS = new Set(['ka', 'ki', 'ke', 'wala', 'wali', 'wale', 'vala', 'vali'].map(numberKey));
const SEPARATORS = new Set(['aur', 'and', 'or', 'phir', 'fir', 'then', 'plus', 'also', 'bhi'].map(numberKey));
/** Filler words dropped from item names. */
const FILLERS = new Set(
  [
    'dena',
    'dedo',
    'de',
    'dijiye',
    'chahiye',
    'please',
    'bhaiya',
    'bhai',
    'ji',
    'add',
    'karo',
    'likho',
    'hai',
    'the',
    'of',
    'a',
  ].map(numberKey),
);

const isSeparator = (t: string) => t === ',' || SEPARATORS.has(numberKey(t));

interface Building {
  words: string[];
  item: string[];
  quantity: number | null;
  unit: SpokenUnit | null;
  amountPaise: number | null;
  /** The quantity came after the item words ("aata do kilo"): the next item word starts a new phrase. */
  quantityAfterItem: boolean;
}

const fresh = (): Building => ({
  words: [],
  item: [],
  quantity: null,
  unit: null,
  amountPaise: null,
  quantityAfterItem: false,
});

/**
 * Splits an utterance into item phrases. Accepted shapes (in any mix, separated by "aur", "and", commas or simply
 * the next quantity): `[qty] [unit] item`, `item [qty] [unit]`, `[amount] rupaye ka item`, `item [amount] ka`,
 * `paav item` (¼ kg / l), `do item` (2 pieces), `item` (1).
 */
export function parseUtterance(text: string): ParsedPhrase[] {
  const tokens = tokenize(text);
  const phrases: ParsedPhrase[] = [];
  let b = fresh();

  const finish = () => {
    const itemText = b.item.join(' ');
    if (itemText || b.amountPaise !== null) {
      phrases.push({
        raw: b.words.join(' '),
        itemText,
        quantity: b.amountPaise !== null ? null : b.quantity,
        unit: b.amountPaise !== null ? null : b.unit,
        amountPaise: b.amountPaise,
      });
    }
    b = fresh();
  };

  for (let i = 0; i < tokens.length;) {
    const t = tokens[i]!;
    const key = numberKey(t);

    if (isSeparator(t)) {
      finish();
      i += 1;
      continue;
    }

    const num = readNumber(tokens, i);
    if (num) {
      const after = tokens[i + num.length];
      const afterKey = after ? numberKey(after) : '';
      const isAmount = AMOUNT_WORDS.has(afterKey) || (LINK_WORDS.has(afterKey) && !UNIT_WORDS[afterKey]);
      // A new quantity after a complete phrase starts the next item ("do kilo aata ek kilo cheeni").
      if (b.item.length > 0 && (b.quantity !== null || b.amountPaise !== null || b.quantityAfterItem))
        finish();
      const trailing = b.item.length > 0;
      b.words.push(...tokens.slice(i, i + num.length));
      i += num.length;
      if (isAmount) {
        b.amountPaise = Math.round(num.value * 100);
        // swallow "rupaye", "ka"
        while (
          tokens[i] &&
          (AMOUNT_WORDS.has(numberKey(tokens[i]!)) || LINK_WORDS.has(numberKey(tokens[i]!)))
        ) {
          b.words.push(tokens[i]!);
          i += 1;
        }
      } else {
        b.quantity = num.value;
        const u = tokens[i] ? UNIT_WORDS[numberKey(tokens[i]!)] : undefined;
        if (u) {
          b.unit = u;
          b.words.push(tokens[i]!);
          i += 1;
        } else if (num.impliesQuarter) {
          b.unit = 'kg'; // "paav paneer": a quarter kilo (litre for liquids is resolved against the item's unit)
        }
      }
      b.quantityAfterItem = trailing;
      continue;
    }

    if (UNIT_WORDS[key] && b.quantity === null && b.item.length === 0 && b.amountPaise === null) {
      // "kilo aata" → one kilo
      b.quantity = 1;
      b.unit = UNIT_WORDS[key]!;
      b.words.push(t);
      i += 1;
      continue;
    }
    if ((LINK_WORDS.has(key) || AMOUNT_WORDS.has(key)) && b.item.length === 0) {
      b.words.push(t);
      i += 1;
      continue;
    }

    // Polite fillers ("bhaiya", "dena") are not part of the item name.
    if (FILLERS.has(key)) {
      b.words.push(t);
      i += 1;
      continue;
    }
    // An item word after "item qty unit" begins the next phrase ("aata do kilo cheeni ek kilo").
    if (b.quantityAfterItem) finish();
    b.words.push(t);
    b.item.push(t);
    i += 1;
  }
  finish();
  return phrases;
}
