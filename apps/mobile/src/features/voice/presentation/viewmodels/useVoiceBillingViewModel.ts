import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechErrorCode, SpeechRecognizer } from '@/core/speech/SpeechRecognizer';
import { type VoiceLine, type VoiceProduct, withProduct } from '../../domain/matcher';
import type { DraftFromSpeech, LearnAlias } from '../../domain/usecases/voiceUseCases';

export interface VoiceBillingViewModelDeps<T extends VoiceProduct = VoiceProduct> {
  recognizer: SpeechRecognizer;
  draftFromSpeech: DraftFromSpeech<T>;
  learnAlias: LearnAlias<T>;
}

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'review' | 'error';
export type VoiceErrorKind = SpeechErrorCode | 'nothing_understood';

/** A line the user confirmed: an item with a quantity, or an amount ("₹50 worth"). */
export interface ConfirmedVoiceLine<T extends VoiceProduct = VoiceProduct> {
  product: T;
  quantityMilli: number | null;
  amountPaise: number | null;
}

/**
 * Voice billing (features/voice-billing.md): idle → listening → processing → review → confirmed | error.
 * Nothing reaches the bill until the user taps "Add to bill"; lines to check stay marked. Picking another item for a
 * phrase can teach an alias (`canLearn`: product.manage).
 */
export function useVoiceBillingViewModel<T extends VoiceProduct>(
  deps: VoiceBillingViewModelDeps<T>,
  shopId: string,
  canLearn: boolean,
  onConfirm: (lines: ConfirmedVoiceLine<T>[]) => void,
) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<VoiceErrorKind | null>(null);
  const [partial, setPartial] = useState('');
  const [transcript, setTranscript] = useState('');
  const [lines, setLines] = useState<VoiceLine<T>[]>([]);
  const fraction = useRef<(unitCode: string) => boolean>(() => true);
  const unsubscribe = useRef<(() => void) | null>(null);
  const gotResult = useRef(false);

  const release = () => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  };
  useEffect(() => () => release(), []);

  /** A transcript (from speech or typed) → draft lines, added to what is already in review. */
  const understand = useCallback(
    async (alternatives: string[]) => {
      setPhase('processing');
      const result = await deps.draftFromSpeech.execute(shopId, alternatives);
      fraction.current = result.allowsFraction;
      setTranscript(result.transcript);
      if (result.lines.length === 0) {
        setError('nothing_understood');
        setPhase(lines.length ? 'review' : 'error');
        return;
      }
      setError(null);
      setLines((ls) => [...ls, ...result.lines]);
      setPhase('review');
    },
    [deps, lines.length, shopId],
  );

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    if (!deps.recognizer.isAvailable()) {
      setError('unsupported');
      setPhase('error');
      return;
    }
    if (!(await deps.recognizer.requestPermission())) {
      setError('permission');
      setPhase('error');
      return;
    }
    gotResult.current = false;
    release();
    setPhase('listening');
    unsubscribe.current = deps.recognizer.start('hi-IN', {
      onPartial: setPartial,
      onFinal: (alternatives) => {
        gotResult.current = true;
        void understand(alternatives);
      },
      onError: (code) => {
        if (gotResult.current) return;
        setError(code);
        setPhase((p) => (p === 'listening' ? 'error' : p));
      },
      onEnd: () => {
        release();
        if (!gotResult.current) setPhase((p) => (p === 'listening' ? 'error' : p));
        setError((e) => e ?? (gotResult.current ? null : 'no_speech'));
      },
    });
  }, [deps, understand]);

  const stop = useCallback(() => deps.recognizer.stop(), [deps]);

  const reset = useCallback(() => {
    release();
    setPhase('idle');
    setError(null);
    setPartial('');
    setTranscript('');
    setLines([]);
  }, []);

  const cancel = useCallback(() => {
    if (phase === 'listening') deps.recognizer.abort();
    reset();
  }, [deps, phase, reset]);

  /** The user picks the item for a phrase (another suggestion, or one for an unmatched phrase). */
  const choose = useCallback(
    (key: string, product: T) => {
      const line = lines.find((l) => l.key === key);
      if (!line) return;
      const suggested = line.product?.id === product.id;
      if (
        canLearn &&
        deps.learnAlias.shouldLearn(line.phrase.itemText, product, line.confidence, suggested)
      ) {
        // Best effort: a failed alias save never blocks billing.
        deps.learnAlias.execute(shopId, line.phrase.itemText, product).catch(() => undefined);
      }
      setLines((ls) => ls.map((l) => (l.key === key ? withProduct(l, product, fraction.current) : l)));
    },
    [canLearn, deps, lines, shopId],
  );

  const remove = useCallback((key: string) => setLines((ls) => ls.filter((l) => l.key !== key)), []);

  const confirm = useCallback(() => {
    const ready = lines
      .filter((l): l is VoiceLine<T> & { product: T } => l.product !== null)
      .map((l) => ({ product: l.product, quantityMilli: l.quantityMilli, amountPaise: l.amountPaise }));
    if (ready.length === 0) return;
    onConfirm(ready);
    reset();
  }, [lines, onConfirm, reset]);

  return {
    state: {
      phase,
      error,
      partial,
      transcript,
      lines,
      unmatched: lines.filter((l) => !l.product).length,
      canConfirm: lines.some((l) => l.product !== null),
    },
    actions: {
      start,
      stop,
      cancel,
      submitText: (text: string) => understand([text]),
      choose,
      remove,
      confirm,
    },
  };
}
