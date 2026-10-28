import { buildVoiceDraft, MATCH_OK, type VoiceLine, type VoiceProduct } from '../matcher';
import { phoneticKey } from '../normalize';
import { parseUtterance } from '../parser';

/** The items voice can match against (the phone's catalogue copy, or the server's when there is none). */
export interface VoiceCatalogue<T extends VoiceProduct = VoiceProduct> {
  load(shopId: string): Promise<{ products: T[]; allowsFraction: (unitCode: string) => boolean }>;
}

/** Saves what the shopkeeper said as an alias of the item they picked (`add_product_alias`). */
export interface AliasLearner {
  learn(shopId: string, productId: string, alias: string): Promise<void>;
}

/**
 * Speech → draft lines (pure parsing and matching over the catalogue). The recognizer gives a few alternatives; the
 * one whose lines match best wins (most matched lines, then highest confidence).
 */
export class DraftFromSpeech<T extends VoiceProduct = VoiceProduct> {
  constructor(
    private readonly catalogue: VoiceCatalogue<T>,
    private readonly newKey: () => string,
  ) {}

  async execute(
    shopId: string,
    alternatives: readonly string[],
  ): Promise<{ transcript: string; lines: VoiceLine<T>[]; allowsFraction: (unitCode: string) => boolean }> {
    const { products, allowsFraction } = await this.catalogue.load(shopId);
    let best: { transcript: string; lines: VoiceLine<T>[]; score: number } | null = null;
    for (const transcript of alternatives.slice(0, 5)) {
      const lines = buildVoiceDraft(parseUtterance(transcript), products, allowsFraction, this.newKey);
      const matched = lines.filter((l) => l.product).length;
      const score = matched * 10 + lines.reduce((s, l) => s + l.confidence, 0) / Math.max(1, lines.length);
      if (!best || score > best.score) best = { transcript, lines, score };
    }
    return { transcript: best?.transcript ?? '', lines: best?.lines ?? [], allowsFraction };
  }
}

/**
 * Learns an alias when the user picks a different item than voice suggested, or picks one for an unmatched phrase
 * — unless the words already match that item well. Needs product.manage on the server; others just skip it.
 */
export class LearnAlias<T extends VoiceProduct = VoiceProduct> {
  constructor(private readonly learner: AliasLearner) {}

  shouldLearn(spoken: string, product: T, matchConfidence: number, wasSuggested: boolean): boolean {
    const words = spoken.trim();
    if (words.length < 2 || words.length > 60) return false;
    if (wasSuggested && matchConfidence >= MATCH_OK) return false;
    const key = phoneticKey(words.replace(/\s+/g, ''));
    return ![product.name, product.nameHi ?? '', ...product.aliases].some(
      (n) => phoneticKey(n.replace(/\s+/g, '')) === key,
    );
  }

  async execute(shopId: string, spoken: string, product: T): Promise<void> {
    await this.learner.learn(shopId, product.id, spoken.trim().toLowerCase());
  }
}
