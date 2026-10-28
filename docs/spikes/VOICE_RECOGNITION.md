# Spike: Hindi / Hinglish speech recognition for voice billing (Phase 10)

Date: 2026-10-28 · Feature: [../features/voice-billing.md](../features/voice-billing.md) · Status: **desk research +
text benchmark done; on-phone audio benchmark pending a device**

## 1. Which module (question 1)
| Option | Verdict |
|---|---|
| **`expo-speech-recognition` 58.0.0** (jamsch) | **Chosen.** Release line follows the Expo SDK (58.0.0 published 2026-10-16); config plugin; Android `SpeechRecognizer` with `lang: 'hi-IN'`, interim results, up to 5 alternatives, `contextualStrings` hints, optional on-device mode, `getSupportedLocales()` / `androidTriggerOfflineModelDownload()` for language packs. Pinned to the exact version. |
| Expo Go / `expo-speech` | Text-to-speech only; no recognition. |
| Cloud speech API (Google Cloud STT, etc.) | Needs a key, uploads audio, costs per minute; against "audio is not uploaded" (ADR-017). Not used. |
| Whisper on device | Too heavy for mid-range Android phones in v1. |

The app talks to it only through `core/speech/SpeechRecognizer` (port), so it can be swapped.

## 2. On-device vs online
- Android 12+ can recognise offline when the **Hindi language pack** is installed (Android System Intelligence /
  Google app). Many phones do not have it by default.
- The app therefore asks for **on-device when available but does not require it** (`requiresOnDeviceRecognition:
  false`): with the pack it works offline; without it, Google's online recognizer is used (audio handled by the phone's
  speech service, not by this app or our backend).
- When neither works the sheet says so and the shopkeeper can **type the same sentence**; the parser handles typed
  text the same way.

## 3. Devanagari or Latin (question 3)
Google's hi-IN recognizer mostly returns **Devanagari** for Hindi words and keeps brand names in Latin ("दो पैकेट
Maggi"); en-IN returns Latin Hinglish. The normaliser handles both and mixes: Devanagari → Latin transliteration,
then phonetic keys (आटा = aata = atta), number words in both scripts, Devanagari digits.

## 4. Benchmark
**Text benchmark (done):** 50 transcripts of typical kirana orders as the recognizer returns them (Devanagari,
Hinglish, English, digits and number words, fractions like aadha / paav / dedh / dhai / sawa / saadhe / paune,
amounts "pachaas rupaye ka", several items in one sentence) against a 34-item fixture catalogue.
Result: **50 / 50 produce the correct draft line(s) without edits** (target ≥ 85 %), in `voiceParser.test.ts`.
Parser table: **306 phrases**; total voice tests 336.

**Audio benchmark (pending):** speaking the same 50 phrases on a mid-range Android phone in a shop-like room, with and
without the Hindi pack, to measure word recognition and latency (question 2). Needs a device; the result decides
whether the default stays hi-IN or tries en-IN as a second pass.

## 5. Decisions
ADR-060 recognizer behind a port, expo-speech-recognition, hi-IN, on-device preferred not required · ADR-061 parsing
and matching are pure TypeScript on the phone; corrections teach aliases (`add_product_alias`, owner/manager).
