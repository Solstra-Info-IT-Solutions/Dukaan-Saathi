# Phase 10 — Hindi/Hinglish Voice Billing with Explicit Confirmation

Status: **Complete — awaiting approval** · Date: 2026-10-28 · Spec: [../features/voice-billing.md](../features/voice-billing.md) ·
Spike: [../spikes/VOICE_RECOGNITION.md](../spikes/VOICE_RECOGNITION.md)

## Features implemented (end-to-end)

### 1. Speak a bill
Bill → **mic** button (shown when the shop has the `voice.billing` entitlement and the phone has a speech service) →
`VoiceBillingSheet` / `useVoiceBillingViewModel` (`idle → listening → processing → review → confirmed | error`):
1. Microphone permission is asked once; `SpeechRecognizer.start('hi-IN')` (expo-speech-recognition; on-device when
   the Hindi pack is installed, otherwise the phone's online service). Words appear while speaking.
2. The recognizer's alternatives (up to 5) → `DraftFromSpeech`: each is parsed and matched; the one with the most
   matched items wins.
3. **Review:** each line shows the item, the quantity in the item's unit ("2 kg", "₹50.00 worth") and "check" when
   unsure (low confidence, two items almost equal, units that do not fit, half a piece). Not-found phrases show the
   words; suggestions appear as chips to pick; any line can be removed. More can be spoken or **typed** (same parser).
4. **Add to bill** is the only way anything reaches the bill (`addVoiceLines`): quantities as said; "₹50 worth"
   becomes a quantity at the item's price (whole units for piece items); the same item twice adds up; the bill is
   saved with `source: 'voice'`. Payment and saving are the normal billing flow (online or queued offline).

### 2. What it understands (pure TypeScript, offline)
- **Scripts:** Devanagari, Latin Hinglish, English, mixed ("दो पैकेट Maggi"); Devanagari digits.
- **Numbers:** digits and decimals; ek … nabbe in Hindi and English; sau / hazaar ("do sau pachaas" = 250);
  aadha ½, paav ¼ (of a kilo or litre), dedh 1½, dhai 2½, sawa X = X+¼, saadhe X = X+½, paune X = X−¼.
- **Shapes:** `do kilo aata`, `aata do kilo`, `pachaas rupaye ka dhaniya`, `dhaniya bees rupaye ka`, `20 ka dhaniya`,
  `paav paneer`, `do sabun`, `kilo aata`; several items with "aur", "and", "phir", commas, or just the next quantity
  ("do kilo aata ek kilo cheeni"). Polite fillers ("bhaiya … dena") are ignored.
- **Units:** kilo/gram, litre/ml, piece/packet/box, dozen — converted to the item's unit (500 gram of a kg item =
  0.5 kg; 1 dozen of a piece item = 12).
- **Matching:** phonetic keys (aata = atta = आटा; zeera = jeera) over the item name, Hindi name and aliases, word by
  word for brand names ("maggi" → "Maggi Masala Noodles"); learned aliases count fully.

### 3. Learning
When an owner or manager picks an item for words voice did not know (or picks another than suggested), those words
become an alias of the item (`add_product_alias`, source `voice_learned`); the next time they match directly, and
other phones get the alias with the next sync. Cashiers' picks are not learned (no catalogue permission).

## Mobile
- **core/speech:** `SpeechRecognizer` port, `createExpoSpeechRecognizer` (expo-speech-recognition 58.0.0, pinned;
  config plugin with microphone text; API checked against the installed SDK 58 types).
- **New feature `voice`:** domain `normalize` (transliterate, tokenize, phoneticKey, numberKey, readNumber), `parser`
  (`parseUtterance`), `matcher` (`matchItem`, `toQuantityMilli`, `buildVoiceDraft`, `withProduct`), use cases
  `DraftFromSpeech`, `LearnAlias` with ports `VoiceCatalogue`, `AliasLearner`; presentation
  `useVoiceBillingViewModel`, `VoiceBillingSheet`.
- **Billing:** `VoiceBillLine`, `addVoiceLines`, mic slot in `BillingScreen` (composed by the bill route).
  **Catalogue:** `AddProductAlias`. **Sync store:** `allProducts` (voice matches the phone's full copy; the server's
  list when there is none yet).
- **Strings:** en + hi, 638 keys each.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261028063726_p10_voice_aliases` | RPC `add_product_alias` (product.manage; trims and lower-cases; skips the item's own name and existing aliases; refreshes search text and `updated_at` so phones sync it) |

No audio or transcripts are stored or sent; only a learned alias text reaches the server.

## Tests executed (2026-10-28)
| Suite | Result |
|---|---|
| mobile (Jest + RNTL) | **514 / 514** (17 suites; voice 336 incl. 306-phrase parser table, 50-phrase benchmark, sheet, view model) |
| admin (Vitest) | **11 / 11** |
| @ds/contracts | **30 / 30** |
| @ds/domain-core | **77 / 77** |
| DB pre-check (PGlite) | **345 / 345** assertions (new `017_voice_aliases` 8) |
| DB pgTAP + storage + concurrency on real Supabase (CI) | ✅ passed on `141e336` ([run 40647201595](https://github.com/Solstra-Info-IT-Solutions/Dukaan-Saathi/actions/runs/40647201595)). The first run on `2d83c69` failed at "Start Supabase" before any test; the jobs are now pinned to `ubuntu-24.04` (GitHub is moving `ubuntu-latest` to Ubuntu 26) and a failed start is reported as annotations |

**Benchmark:** 50 kirana transcripts (Devanagari, Hinglish, English, fractions, amounts, multi-item) → **50 / 50**
correct draft lines without edits (target ≥ 85 %). Audio on a real phone not yet measured (see spike).
**App:** transliteration and phonetic keys; tokenising "2kg", "₹50"; 306 single-item phrases (20 quantity forms ×
7 units × 2 orders, 18 amount phrases, 8 special); 6 multi-item sentences; number words ("do sau pachaas", "saadhe
teen sau", "chai" is not six); unit conversion; Hindi name / alias / brand matching and unknown words; lines to check
(half a soap, kilos of soap, unknown); sheet: speech → review → only "Add to bill" confirms; not-found + typed input;
permission / no-speech / network errors explained; no permission → typing still offered; picking an item for unknown
words teaches the alias; alias rules; billing adds voice lines (1.5 kg + ₹20 worth of onion = 2 kg) with source voice.
**Database:** alias saved trimmed and lower-case as `voice_learned`; repeat and own name add nothing; search finds the
item by the alias; one-letter alias refused; cashier and another shop refused.

Static checks: format ✅, typecheck ✅, lint ✅ (0 warnings), SQL fixtures current ✅.

## Acceptance criteria
- [~] Spike benchmark recorded; ≥ 85 % target — **met on the 50-phrase text benchmark (100 %)**; the on-phone audio
  benchmark (recognition accuracy, latency) needs a device — documented gap.
- [x] No sale without confirm tap — lines reach the bill only through "Add to bill", and the bill is then paid and
  saved through the normal Pay → Confirm flow (tests).
- [x] Parser/matcher test suite ≥ 200 phrases — 306 table phrases + 50 benchmark + 6 multi-item.

## Decisions (DECISIONS.md)
ADR-060 recognizer behind a port (expo-speech-recognition, hi-IN, on-device preferred, not required) · ADR-061 parsing
and matching on the phone in pure TypeScript; corrections by owners/managers teach aliases.

## Known limitations (Phase 10)
- Recognition accuracy and latency on real phones are not yet measured; noisy shops will lower them.
- Without the phone's Hindi pack, recognition needs the internet (the phone's speech service, not our server).
- Unmatched phrases can be matched to an item or removed; adding them as a quick line with an amount is not in the
  sheet yet (type the amount on the keypad).
- Quantities can be corrected after "Add to bill" with the normal line editor, not inside the voice sheet.
- Only Hindi/Hinglish/English; the `voice_billing` feature flag and kill switch arrive with flags in Phase 12 (today:
  entitlement + device check).
- Cloud parsing (ADR-017) not built.

## External configuration still required
A development build (expo-speech-recognition is a native module) and a test phone, ideally with the Hindi offline
pack; otherwise unchanged (Supabase Auth email template / SMS provider, EAS, push credentials, printers).

## Recommended next phase
Phase 11 — managed onboarding and the admin panel.
