/**
 * Speech recognition port (features/voice-billing.md): the library behind it can be swapped. Audio is never stored
 * or uploaded by the app; recognition runs in the phone's speech service (on-device when its language pack is
 * installed).
 */
export type SpeechLanguage = 'hi-IN' | 'en-IN';
export type SpeechErrorCode = 'permission' | 'no_speech' | 'unsupported' | 'network' | 'busy' | 'unknown';

export interface SpeechHandlers {
  /** Words recognised so far (shown while listening). */
  onPartial(text: string): void;
  /** Final result: the recognizer's alternatives, best first. */
  onFinal(alternatives: string[]): void;
  onError(code: SpeechErrorCode): void;
  /** Always last, also after an error. */
  onEnd(): void;
}

export interface SpeechRecognizer {
  isAvailable(): boolean;
  requestPermission(): Promise<boolean>;
  /** Starts listening; returns a function that removes the handlers. */
  start(language: SpeechLanguage, handlers: SpeechHandlers): () => void;
  /** Stop listening and deliver the final result. */
  stop(): void;
  /** Stop without a result. */
  abort(): void;
}
