/**
 * Text normalisation for voice billing (features/voice-billing.md): the recognizer may return Devanagari, Latin
 * (Hinglish) or a mix. Everything is turned into lower-case Latin, then compared with phonetic keys so "aata",
 * "atta" and "आटा" match. Pure functions, no platform code.
 */

const VOWELS: Record<string, string> = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ऑ: 'o',
};
const MATRAS: Record<string, string> = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ॉ': 'o',
};
const CONSONANTS: Record<string, string> = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'n',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'n',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  ळ: 'l',
};
const NUKTA: Record<string, string> = { क: 'q', ख: 'kh', ग: 'g', ज: 'z', ड: 'r', ढ: 'rh', फ: 'f' };
const DIGITS = '०१२३४५६७८९';
const VIRAMA = '्';
const NUKTA_SIGN = '़';

/** Devanagari → Latin, with the inherent "a" dropped at the end of a word ("चीनी" → "cheenee", "दूध" → "doodh"). */
export function transliterate(input: string): string {
  let out = '';
  const chars = [...input.normalize('NFC')];
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i]!;
    const d = DIGITS.indexOf(c);
    if (d >= 0) {
      out += String(d);
    } else if (VOWELS[c]) {
      out += VOWELS[c];
    } else if (CONSONANTS[c]) {
      let base = CONSONANTS[c]!;
      let next = chars[i + 1];
      if (next === NUKTA_SIGN) {
        base = NUKTA[c] ?? base;
        i += 1;
        next = chars[i + 1];
      }
      out += base;
      if (next && MATRAS[next]) {
        out += MATRAS[next];
        i += 1;
      } else if (next === VIRAMA) {
        i += 1;
      } else if (next && (CONSONANTS[next] || next === 'ं' || next === 'ँ')) {
        out += 'a';
      } else if (next && /[ऀ-ॿ]/.test(next) && !/[\s\d]/.test(next)) {
        out += 'a';
      }
      // end of word: no inherent vowel
    } else if (c === 'ं' || c === 'ँ') {
      out += 'n';
    } else if (c === 'ः') {
      out += 'h';
    } else if (c === '।' || c === '॥') {
      out += ',';
    } else {
      out += c;
    }
  }
  return out;
}

/** Lower-case Latin words; "₹50", "2.5kg" and "500g" are split into number and unit. */
export function tokenize(input: string): string[] {
  return transliterate(input)
    .toLowerCase()
    .replace(/₹\s*/g, ' rupaye ')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[,;+&]/g, ' , ')
    .replace(/[^a-z0-9.,/ ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Phonetic key for matching item names: aspirates, long vowels, doubled letters and a final "a" folded away. */
export function phoneticKey(word: string): string {
  let w = transliterate(word)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  w = w
    .replace(/ph/g, 'f')
    .replace(/(k|g|c|j|t|d|p|b)h/g, '$1')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ck/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/ee|ii|ea|ie/g, 'i')
    .replace(/oo|uu|ou/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/y$/, 'i')
    .replace(/(.)\1+/g, '$1');
  if (w.length > 3) w = w.replace(/[a]$/, '');
  return w;
}

/** Light key for number words: keeps aspirates so "saat" (7) and "saath" (60) stay apart. */
export function numberKey(word: string): string {
  return transliterate(word)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ee|ii/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/(.)\1+/g, '$1');
}

const UNITS: Record<number, string[]> = {
  0: ['zero', 'shunya', 'sunya'],
  1: ['ek', 'one', 'ik'],
  2: ['do', 'two'],
  3: ['teen', 'three', 'tin'],
  4: ['char', 'chaar', 'four', 'chaar'],
  5: ['paanch', 'panch', 'five', 'panc'],
  6: ['chhe', 'chhah', 'chah', 'six'],
  7: ['saat', 'sat', 'seven'],
  8: ['aath', 'ath', 'eight'],
  9: ['nau', 'nine'],
  10: ['das', 'dus', 'ten'],
  11: ['gyarah', 'gyara', 'eleven'],
  12: ['barah', 'bara', 'twelve'],
  13: ['terah', 'tera', 'thirteen'],
  14: ['chaudah', 'chauda', 'fourteen'],
  15: ['pandrah', 'pandra', 'fifteen'],
  16: ['solah', 'sola', 'sixteen'],
  17: ['satrah', 'satra', 'seventeen'],
  18: ['atharah', 'athara', 'eighteen'],
  19: ['unnees', 'unnis', 'nineteen'],
  20: ['bees', 'bis', 'twenty'],
  25: ['pachees', 'pachis', 'twentyfive'],
  30: ['tees', 'tis', 'thirty'],
  35: ['paintees', 'paintis'],
  40: ['chalees', 'chalis', 'chaalis', 'forty'],
  45: ['paintalees', 'paintalis'],
  50: ['pachaas', 'pachas', 'fifty'],
  60: ['saath', 'sath', 'sixty'],
  70: ['sattar', 'satar', 'seventy'],
  75: ['pachhattar', 'pachattar'],
  80: ['assi', 'asi', 'eighty'],
  90: ['nabbe', 'nabe', 'ninety'],
};
const MULTIPLIERS: Record<string, number> = {
  sau: 100,
  hundred: 100,
  hazaar: 1000,
  hajar: 1000,
  hazar: 1000,
  thousand: 1000,
};
/** Fraction words: aadha = ½, paav = ¼ (of a kilo or litre), dedh = 1½, dhai = 2½. */
const FRACTIONS: Record<string, number> = {
  adha: 0.5,
  adhi: 0.5,
  adhe: 0.5,
  half: 0.5,
  paw: 0.25,
  pav: 0.25,
  pau: 0.25,
  pao: 0.25,
  quarter: 0.25,
  dedh: 1.5,
  ded: 1.5,
  derh: 1.5,
  dhai: 2.5,
  dhaai: 2.5,
  dhae: 2.5,
  dhaii: 2.5,
};
/** Prefixes that change the following number: sawa X = X + ¼, saadhe X = X + ½, paune X = X − ¼. */
const PREFIXES: Record<string, number> = {
  sava: 0.25,
  sawa: 0.25,
  sadhe: 0.5,
  sade: 0.5,
  paune: -0.25,
  pone: -0.25,
};

const NUMBER_WORDS = new Map<string, number>();
for (const [value, words] of Object.entries(UNITS))
  for (const w of words) NUMBER_WORDS.set(numberKey(w), Number(value));
const FRACTION_WORDS = new Map(Object.entries(FRACTIONS).map(([w, v]) => [numberKey(w), v]));
const PREFIX_WORDS = new Map(Object.entries(PREFIXES).map(([w, v]) => [numberKey(w), v]));
const MULTIPLIER_WORDS = new Map(Object.entries(MULTIPLIERS).map(([w, v]) => [numberKey(w), v]));

export interface NumberRead {
  value: number;
  /** Tokens used. */
  length: number;
  /** "paav" alone means a quarter kilo / litre. */
  impliesQuarter: boolean;
}

/**
 * Reads a number at `tokens[start]`: digits ("2", "2.5", "1/2"), words ("do", "pachaas", "do sau pachaas"),
 * fractions ("aadha", "dedh", "dhai", "paav") and prefixes ("sawa do" = 2¼, "saadhe teen" = 3½, "paune do" = 1¾).
 */
export function readNumber(tokens: readonly string[], start: number): NumberRead | null {
  const first = tokens[start];
  if (first === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(first)) {
    // "1 1/2" style is rare in speech; plain digits and decimals are common.
    return { value: Number(first), length: 1, impliesQuarter: false };
  }
  const frac = /^(\d+)\/(\d+)$/.exec(first);
  if (frac && Number(frac[2]) > 0)
    return { value: Number(frac[1]) / Number(frac[2]), length: 1, impliesQuarter: false };

  const key = numberKey(first);
  if (FRACTION_WORDS.has(key)) {
    const v = FRACTION_WORDS.get(key)!;
    // "dhai sau" = 250, "dedh sau" = 150
    const mul = tokens[start + 1] ? MULTIPLIER_WORDS.get(numberKey(tokens[start + 1]!)) : undefined;
    if (mul) return { value: v * mul, length: 2, impliesQuarter: false };
    return { value: v, length: 1, impliesQuarter: v === 0.25 };
  }
  if (PREFIX_WORDS.has(key)) {
    const rest = readNumber(tokens, start + 1);
    // "sawa kilo" = 1¼, "paune kilo" = ¾: the prefix alone applies to one.
    if (!rest) return { value: 1 + PREFIX_WORDS.get(key)!, length: 1, impliesQuarter: false };
    if (rest.value < 1) return null;
    const step = PREFIX_WORDS.get(key)!;
    // "saadhe teen sau" = 350, "sawa sau" = 125: with hundreds the prefix counts in hundreds.
    const value = rest.value >= 100 ? rest.value + step * 100 : rest.value + step;
    return { value, length: rest.length + 1, impliesQuarter: false };
  }
  if (!NUMBER_WORDS.has(key) && !MULTIPLIER_WORDS.has(key)) return null;

  // Words with multipliers: "do sau pachaas" = 250, "ek hazaar" = 1000, "sau" = 100.
  let total = 0;
  let current = 0;
  let used = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const k = numberKey(tokens[i]!);
    const n = NUMBER_WORDS.get(k);
    const m = MULTIPLIER_WORDS.get(k);
    if (n !== undefined) {
      if (current !== 0) break; // "do teen" is two numbers; words only join through sau / hazaar
      current += n;
    } else if (m !== undefined) {
      total += (current || 1) * m;
      current = 0;
    } else {
      break;
    }
    used += 1;
  }
  return used ? { value: total + current, length: used, impliesQuarter: false } : null;
}
