# Spike: Bluetooth thermal printing (BL-508, OD-08)

Date: 2026-10-25 · Status: **desk research only — no printer or Android device available in this environment**

## Question
Can the app print receipts on the cheap 58 mm / 80 mm Bluetooth ESC/POS printers common in kirana shops, and what would it cost?

## What exists today
Receipts are shared as WhatsApp text and as a PDF (`expo-print` → share sheet). Many printer vendors ship an Android
"print service" or a companion app that accepts a shared PDF/image, so **sharing the PDF to the printer's app already works
for some printers without any code** — to be confirmed with pilot shops' printers.

## Options found
| Option | Notes |
|---|---|
| `react-native-bluetooth-escpos-printer` and its forks (original by januslo; forks such as `@vardrz/…`, `@hikaaam/react-native-bluetooth-printer`, `react-native-bluetooth-escpos-printer-hakurei`) | The common route. Native Bluetooth code, so it does **not** run in Expo Go and needs a development build (EAS). READMEs describe the packages as still under development; maintenance and Expo SDK 58 support are not established. One fork lists `@config-plugins/android-bluetooth`, suggesting an Expo config-plugin setup. |
| `expo-escpos` | Expo module for 58/80 mm receipts; renders HTML to printer images, which would also handle Devanagari (most printers' built-in fonts cannot print Hindi). Bluetooth transport and config-plugin support not confirmed from its listing. |

Sources: [expo-escpos](https://classic.yarnpkg.com/en/package/expo-escpos),
[dr-old-react-native-bluetooth-escpos-printer](https://github.com/dr-old/dr-old-react-native-bluetooth-escpos-printer),
[react-native-bluetooth-escpos-printer-hakurei](https://cnb.cool/marisa/npm/-/registries/react-native-bluetooth-escpos-printer-hakurei/-/tag/0.0.10),
[@hikaaam/react-native-bluetooth-printer README](https://cdn.jsdelivr.net/npm/@hikaaam/react-native-bluetooth-printer@0.1.2/README.md),
[react-native-bluetooth-escpos-printer-fork README](https://cdn.jsdelivr.net/npm/react-native-bluetooth-escpos-printer-fork@0.0.28/README.md).

## Constraints that matter for us
- **Hindi text:** ESC/POS code pages do not include Devanagari; Hindi receipts must be printed as an image (render the
  receipt HTML/view to a 384 px / 576 px wide bitmap). The receipt model in `features/billing/domain/receipt.ts` already
  produces HTML that can be rasterised.
- **Android 12+ Bluetooth permissions** (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`) need a config plugin and a runtime prompt.
- **Development build required** (EAS account — listed under external configuration since Phase 04).

## Recommendation
Keep OD-08 open. Before writing code: (1) ask pilot shops which printers they have; (2) try PDF share → printer app on
those printers; (3) only if that fails, build a small `core/printing` port with one native library behind it, printing
the receipt as an image, tested on at least two printer models. Estimated 3–5 days including device testing.
