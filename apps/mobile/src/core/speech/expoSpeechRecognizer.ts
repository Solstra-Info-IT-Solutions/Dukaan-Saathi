import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { SpeechErrorCode, SpeechRecognizer } from './SpeechRecognizer';

const ERRORS: Record<string, SpeechErrorCode> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'unsupported',
  'language-not-supported': 'unsupported',
  'no-speech': 'no_speech',
  'speech-timeout': 'no_speech',
  network: 'network',
  busy: 'busy',
};

/**
 * expo-speech-recognition (SDK 58). Hindi first; the phone's on-device model is preferred but not required, so phones
 * without the Hindi pack still work online. Kirana words are passed as hints (`contextualStrings`).
 */
export function createExpoSpeechRecognizer(hints: () => string[] = () => []): SpeechRecognizer {
  return {
    isAvailable: () => {
      try {
        return ExpoSpeechRecognitionModule.isRecognitionAvailable();
      } catch {
        return false;
      }
    },
    requestPermission: async () => (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted,
    start: (language, handlers) => {
      const subs = [
        ExpoSpeechRecognitionModule.addListener('result', (e) => {
          const texts = e.results.map((r) => r.transcript).filter(Boolean);
          if (e.isFinal) handlers.onFinal(texts);
          else if (texts[0]) handlers.onPartial(texts[0]);
        }),
        ExpoSpeechRecognitionModule.addListener('error', (e) => {
          if (e.error !== 'aborted') handlers.onError(ERRORS[e.error] ?? 'unknown');
        }),
        ExpoSpeechRecognitionModule.addListener('nomatch', () => handlers.onError('no_speech')),
        ExpoSpeechRecognitionModule.addListener('end', () => handlers.onEnd()),
      ];
      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: true,
        maxAlternatives: 3,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: hints().slice(0, 100),
      });
      return () => subs.forEach((s) => s.remove());
    },
    stop: () => ExpoSpeechRecognitionModule.stop(),
    abort: () => ExpoSpeechRecognitionModule.abort(),
  };
}
