import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { SpeechErrorCode, SpeechHandlers, SpeechRecognizer } from '@/core/speech/SpeechRecognizer';
import { CATALOGUE, FRACTION_UNITS } from '../../../../tests/fakes/voiceCatalogue';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type { VoiceProduct } from '../domain/matcher';
import { DraftFromSpeech, LearnAlias } from '../domain/usecases/voiceUseCases';
import { VoiceBillingSheet } from '../presentation/components/VoiceBillingSheet';
import { useVoiceBillingViewModel } from '../presentation/viewmodels/useVoiceBillingViewModel';

const SHOP = '0190f0f0-0000-7000-8000-00000000000a';

/** A recognizer that says what the test tells it to. */
class FakeRecognizer implements SpeechRecognizer {
  available = true;
  permission = true;
  languages: string[] = [];
  aborted = 0;
  private handlers: SpeechHandlers | null = null;
  isAvailable = () => this.available;
  requestPermission = async () => this.permission;
  start(language: string, handlers: SpeechHandlers) {
    this.languages.push(language);
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }
  stop() {}
  abort() {
    this.aborted += 1;
  }
  say(...alternatives: string[]) {
    const h = this.handlers!;
    h.onPartial(alternatives[0]!);
    h.onFinal(alternatives);
    h.onEnd();
  }
  fail(code: SpeechErrorCode) {
    const h = this.handlers!;
    h.onError(code);
    h.onEnd();
  }
}

let n = 0;
function setup() {
  const recognizer = new FakeRecognizer();
  const learned: [string, string][] = [];
  const deps = {
    recognizer,
    draftFromSpeech: new DraftFromSpeech<VoiceProduct>(
      { load: async () => ({ products: CATALOGUE, allowsFraction: (u) => FRACTION_UNITS.has(u) }) },
      () => `line-${++n}`,
    ),
    learnAlias: new LearnAlias<VoiceProduct>({
      learn: async (_shop, productId, alias) => void learned.push([productId, alias]),
    }),
  };
  return { recognizer, learned, deps };
}

async function open(canLearn = true) {
  const s = setup();
  const onConfirm = jest.fn();
  await renderWithProviders(
    <VoiceBillingSheet deps={s.deps} shopId={SHOP} canLearn={canLearn} onConfirm={onConfirm} />,
  );
  await fireEvent.press(screen.getByLabelText('Speak items'));
  await waitFor(() => expect(s.recognizer.languages).toEqual(['hi-IN']));
  return { ...s, onConfirm };
}

describe('voice billing sheet', () => {
  it('speech becomes lines to review; nothing reaches the bill before "Add to bill"', async () => {
    const { recognizer, onConfirm } = await open();
    await act(async () =>
      recognizer.say('do kilo aata aur pachaas rupaye ka dhaniya', 'do kilo ata or pachas rupay ka dhaniya'),
    );
    expect(await screen.findByText('Aashirvaad Atta')).toBeTruthy();
    expect(screen.getByText('2 kg')).toBeTruthy();
    expect(screen.getByText('Coriander')).toBeTruthy();
    expect(screen.getByText('₹50.00 worth')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Add to bill'));
    expect(onConfirm).toHaveBeenCalledWith([
      { product: expect.objectContaining({ id: 'atta' }), quantityMilli: 2000, amountPaise: null },
      { product: expect.objectContaining({ id: 'dhaniya' }), quantityMilli: null, amountPaise: 5000 },
    ]);
  });

  it('an unknown word is shown as not found; picking the item teaches the word as an alias', async () => {
    const { recognizer, learned, onConfirm } = await open(true);
    await act(async () => recognizer.say('ek kilo meetha'));
    expect(await screen.findByText('Not found: “meetha”')).toBeTruthy();
    // Typing works too, and adds to what is already there.
    await fireEvent.changeText(screen.getByLabelText('Or type the items'), 'ek kilo chini');
    await fireEvent(screen.getByLabelText('Or type the items'), 'submitEditing');
    expect(await screen.findByText('Sugar')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove ek kilo meetha'));
    await fireEvent.press(screen.getByText('Add to bill'));
    expect(onConfirm).toHaveBeenCalledWith([
      { product: expect.objectContaining({ id: 'cheeni' }), quantityMilli: 1000, amountPaise: null },
    ]);
    expect(learned).toEqual([]); // nothing was corrected
  });

  it.each([
    ['permission', 'Allow the microphone to use voice.'],
    ['no_speech', 'Nothing was heard. Try again a little closer.'],
    ['network', 'Voice needs the internet on this phone (no Hindi voice pack installed).'],
  ] as const)('recognizer error %s is explained', async (code, text) => {
    const { recognizer } = await open();
    await act(async () => recognizer.fail(code));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('without a speech service or microphone permission the user is told and can type instead', async () => {
    const s = setup();
    s.recognizer.permission = false;
    await renderWithProviders(
      <VoiceBillingSheet deps={s.deps} shopId={SHOP} canLearn={false} onConfirm={jest.fn()} />,
    );
    await fireEvent.press(screen.getByLabelText('Speak items'));
    expect(await screen.findByText('Allow the microphone to use voice.')).toBeTruthy();
    expect(screen.getByLabelText('Or type the items')).toBeTruthy();
  });
});

describe('alias learning', () => {
  it('picking the item for words voice did not know saves them as an alias (owner / manager)', async () => {
    const { deps, learned } = setup();
    const onConfirm = jest.fn();
    const { result } = await renderHook(() => useVoiceBillingViewModel(deps, SHOP, true, onConfirm));
    await act(async () => result.current.actions.submitText('ek kilo meetha'));
    const line = result.current.state.lines[0]!;
    expect(line).toMatchObject({ status: 'unmatched', product: null });
    await act(async () =>
      result.current.actions.choose(
        line.key,
        CATALOGUE.find((p) => p.id === 'cheeni')!,
      ),
    );
    expect(learned).toEqual([['cheeni', 'meetha']]);
    expect(result.current.state.lines[0]).toMatchObject({ status: 'ok', quantityMilli: 1000 });
  });

  const sugar = CATALOGUE.find((p) => p.id === 'cheeni')!;
  const learn = new LearnAlias<VoiceProduct>({ learn: async () => {} });
  it('learns new words for an item, not words it already knows or a confirmed good match', () => {
    expect(learn.shouldLearn('meetha', sugar, 0, false)).toBe(true);
    expect(learn.shouldLearn('shakkar', sugar, 0.5, false)).toBe(false); // already an alias
    expect(learn.shouldLearn('chini', sugar, 0.9, true)).toBe(false);
    expect(learn.shouldLearn('x', sugar, 0, false)).toBe(false);
  });
});
