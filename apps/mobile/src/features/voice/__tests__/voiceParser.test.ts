import { buildVoiceDraft, matchItem, toQuantityMilli } from '../domain/matcher';
import { numberKey, phoneticKey, readNumber, tokenize, transliterate } from '../domain/normalize';
import { parseUtterance } from '../domain/parser';
import { BENCHMARK, CATALOGUE, FRACTION_UNITS } from '../../../../tests/fakes/voiceCatalogue';

let n = 0;
const key = () => `k${++n}`;
const draft = (text: string) =>
  buildVoiceDraft(parseUtterance(text), CATALOGUE, (u) => FRACTION_UNITS.has(u), key);

describe('normalisation', () => {
  it.each([
    ['आटा', 'aataa'],
    ['चीनी', 'cheenee'],
    ['दूध', 'doodh'],
    ['पनीर', 'paneer'],
    ['मैगी', 'maigee'],
    ['प्याज़', 'pyaaz'],
    ['दो किलो', 'do kilo'],
    ['१२', '12'],
  ])('%s → %s', (hi, latin) => expect(transliterate(hi)).toBe(latin));

  it('phonetic keys fold spelling differences', () => {
    expect(phoneticKey('aata')).toBe(phoneticKey('atta'));
    expect(phoneticKey('आटा')).toBe(phoneticKey('aata'));
    expect(phoneticKey('cheeni')).toBe(phoneticKey('चीनी'));
    expect(phoneticKey('doodh')).toBe(phoneticKey('दूध'));
    expect(phoneticKey('zeera')).toBe(phoneticKey('jeera'));
    expect(numberKey('saat')).not.toBe(numberKey('saath'));
  });

  it('splits digits from units and the rupee sign', () => {
    expect(tokenize('2kg atta, ₹50 ka dhaniya')).toEqual([
      '2',
      'kg',
      'atta',
      ',',
      'rupaye',
      '50',
      'ka',
      'dhaniya',
    ]);
  });
});

// ---- 200+ parser table cases ---------------------------------------------------------------------------------
const QUANTITIES: [string, number][] = [
  ['ek', 1],
  ['do', 2],
  ['teen', 3],
  ['char', 4],
  ['paanch', 5],
  ['das', 10],
  ['aadha', 0.5],
  ['dedh', 1.5],
  ['dhai', 2.5],
  ['sawa do', 2.25],
  ['saadhe teen', 3.5],
  ['paune do', 1.75],
  ['2', 2],
  ['1.5', 1.5],
  ['एक', 1],
  ['दो', 2],
  ['तीन', 3],
  ['ढाई', 2.5],
  ['डेढ़', 1.5],
  ['आधा', 0.5],
];
const UNITS: [string, string][] = [
  ['kilo', 'kg'],
  ['kg', 'kg'],
  ['gram', 'g'],
  ['litre', 'l'],
  ['packet', 'pkt'],
  ['किलो', 'kg'],
  ['दर्जन', 'dozen'],
];
const parserCases: [
  string,
  { itemText: string; quantity: number | null; unit: string | null; amountPaise: number | null },
][] = [];
QUANTITIES.forEach(([q, value], i) => {
  UNITS.forEach(([u, code], j) => {
    const item = ['chawal', 'cheeni', 'aata', 'dal'][(i + j) % 4]!;
    parserCases.push([
      `${q} ${u} ${item}`,
      { itemText: item, quantity: value, unit: code, amountPaise: null },
    ]);
    parserCases.push([
      `${item} ${q} ${u}`,
      { itemText: item, quantity: value, unit: code, amountPaise: null },
    ]);
  });
});
const AMOUNTS: [string, number][] = [
  ['bees', 20],
  ['pachaas', 50],
  ['sau', 100],
  ['do sau pachaas', 250],
  ['50', 50],
  ['पचास', 50],
];
for (const [a, rupees] of AMOUNTS) {
  for (const text of [`${a} rupaye ka dhaniya`, `dhaniya ${a} rupaye ka`, `${a} ka dhaniya`]) {
    parserCases.push([text, { itemText: 'dhaniya', quantity: null, unit: null, amountPaise: rupees * 100 }]);
  }
}
parserCases.push(
  ['maggi', { itemText: 'maggi', quantity: null, unit: null, amountPaise: null }],
  ['do maggi', { itemText: 'maggi', quantity: 2, unit: null, amountPaise: null }],
  ['paav paneer', { itemText: 'paneer', quantity: 0.25, unit: 'kg', amountPaise: null }],
  ['kilo aata', { itemText: 'aata', quantity: 1, unit: 'kg', amountPaise: null }],
  ['bhaiya do kilo aata dena', { itemText: 'aata', quantity: 2, unit: 'kg', amountPaise: null }],
  ['2.5 kg chawal', { itemText: 'chawal', quantity: 2.5, unit: 'kg', amountPaise: null }],
  ['500g tamatar', { itemText: 'tamatar', quantity: 500, unit: 'g', amountPaise: null }],
  ['ek hazaar gram cheeni', { itemText: 'cheeni', quantity: 1000, unit: 'g', amountPaise: null }],
);

describe(`parser (${parserCases.length} phrases)`, () => {
  it('has at least 200 single-item phrases', () => expect(parserCases.length).toBeGreaterThanOrEqual(200));
  it.each(parserCases)('%s', (text, expected) => {
    const phrases = parseUtterance(text);
    expect(phrases).toHaveLength(1);
    const p = phrases[0]!;
    expect({ itemText: p.itemText, quantity: p.quantity, unit: p.unit, amountPaise: p.amountPaise }).toEqual({
      ...expected,
      quantity: expected.quantity === null ? null : expect.closeTo(expected.quantity, 5),
    });
  });

  it.each([
    ['ek kilo aloo aur aadha kilo pyaaz', ['aloo', 'pyaaz']],
    ['do kilo aata ek kilo cheeni teen packet maggi', ['aata', 'cheeni', 'maggi']],
    ['aata do kilo cheeni ek kilo', ['aata', 'cheeni']],
    ['do kilo atta, ek packet maggi, 20 ka dhaniya', ['atta', 'maggi', 'dhaniya']],
    ['दो किलो आलू और एक किलो प्याज़', ['aaloo', 'pyaaz']],
    ['ek litre doodh phir do bread', ['doodh', 'bread']],
  ])('several items: %s', (text, items) => {
    expect(parseUtterance(text).map((p) => p.itemText)).toEqual(items);
  });

  it('reads number words', () => {
    const r = (t: string) => readNumber(t.split(' '), 0)?.value;
    expect([
      r('do sau pachaas'),
      r('ek hazaar do sau'),
      r('dhai sau'),
      r('saadhe teen sau'),
      r('sawa sau'),
    ]).toEqual([250, 1200, 250, 350, 125]);
    expect(r('chai')).toBeUndefined(); // tea, not six
  });
});

describe('matching and units', () => {
  it('converts spoken units to the item unit', () => {
    expect(toQuantityMilli(500, 'g', 'kg')).toEqual({ milli: 500, mismatch: false });
    expect(toQuantityMilli(1, 'dozen', 'pc')).toEqual({ milli: 12000, mismatch: false });
    expect(toQuantityMilli(6, 'pc', 'dozen')).toEqual({ milli: 500, mismatch: false });
    expect(toQuantityMilli(0.25, 'kg', 'l')).toEqual({ milli: 250, mismatch: false });
    expect(toQuantityMilli(2, 'kg', 'pc')).toEqual({ milli: 2000, mismatch: true });
  });

  it('matches by Hindi name, alias and brand, and leaves unknown words unmatched', () => {
    expect(matchItem('चीनी', CATALOGUE).product?.id).toBe('cheeni');
    expect(matchItem('shakkar', CATALOGUE).product?.id).toBe('cheeni');
    expect(matchItem('maggi', CATALOGUE).product?.id).toBe('maggi');
    expect(matchItem('kanda', CATALOGUE).product?.id).toBe('pyaaz');
    expect(matchItem('helicopter', CATALOGUE).product).toBeNull();
  });

  it('marks lines to check: low confidence, wrong units, half a soap', () => {
    const [soap] = draft('aadha sabun');
    expect(soap).toMatchObject({
      status: 'check',
      quantityMilli: 1000,
      issues: expect.arrayContaining(['whole_units']),
    });
    const [kiloSoap] = draft('do kilo sabun');
    expect(kiloSoap?.issues).toContain('unit_mismatch');
    const [unknown] = draft('do kilo helicopter');
    expect(unknown).toMatchObject({ status: 'unmatched', product: null });
  });
});

describe('spike benchmark (50 phrases)', () => {
  const outcomes = BENCHMARK.map(([text, expected]) => {
    const lines = draft(text);
    const ok =
      lines.length === expected.length &&
      lines.every((l, i) => {
        const [id, want] = expected[i]!;
        if (l.product?.id !== id || l.status === 'unmatched') return false;
        return typeof want === 'number'
          ? l.quantityMilli === want && l.amountPaise === null
          : l.amountPaise === want.amount;
      });
    return {
      text,
      ok,
      got: lines.map((l) => [l.product?.id ?? null, l.quantityMilli ?? l.amountPaise, l.status]),
    };
  });
  const correct = outcomes.filter((o) => o.ok).length;

  it(`at least 85 % of transcripts give the right draft without edits (${correct}/50)`, () => {
    if (correct < 50) console.log(outcomes.filter((o) => !o.ok));
    expect(BENCHMARK).toHaveLength(50);
    expect(correct / 50).toBeGreaterThanOrEqual(0.85);
  });
});
