# Brand System — Dukaan Saathi ("Har Dukaan Ka Saathi")

Source of truth: the Brand Kit, copied unchanged to [brand/](brand/) (`design-tokens.css`, `color-palette.json`,
`README.md`, `CLAUDE_UI_DESIGN_PROMPT.md`). Change values there first, then in the two mappings below.

## Where the tokens live
| App | File | How |
|---|---|---|
| Admin (Next.js, Tailwind v4) | `apps/admin/src/styles/design-tokens.css` (kit file, unchanged) → `src/app/globals.css` `@theme inline` | Tailwind names: `bg-brand`, `bg-action`, `text-ink`, `text-ink-2`, `border-line`, `bg-page`, `bg-tint`, `text-success / warning / error / info` + `-bg`, `rounded-ds-sm/md/lg/xl`, `shadow-card / modal` |
| Admin components | `src/core/ui/classes.ts`, `src/core/ui/ui.tsx` | `button`, `secondaryButton`, `dangerButton`, `input`, `card`, `table`, `tableWrap`, `PageTitle`, `Alert`, `Badge`, `StatCard`, `EmptyState` |
| Mobile (Expo, React Native Paper) | `apps/mobile/src/shared/theme/brand.ts` → `theme.ts` (Paper light and dark themes) | Paper colours; `Button` wrapper; `BrandLogo` |

## Rules applied
- **Forest `#0F3D2E`** for structure: headings, active navigation, links, text buttons, focused fields.
- **Primary call to action: action green `#22C55E` with a forest label.** White on action green is only 2.28:1
  (fails WCAG AA); forest on action green is 5.34:1. Admin `button`, mobile `shared/components/Button` (contained).
- Pale green `#F0FDF4` / light green `#A7F3D0` for selected and highlighted states; white cards on `#F8FAFC`.
- Red / amber / blue only for error / warning / info, always with a word ("Problem:", "Note:") or label.
- Dark green `#16A34A` is not used for small text (3.3:1 on white).
- Field borders use secondary grey `#6B7280` (4.8:1; muted `#9CA3AF` is 2.5:1, below WCAG 1.4.11's 3:1).
- Inter: admin via `next/font` (self-hosted at build), mobile embedded with the `expo-font` config plugin (400–700).
- Radii 8 / 12 / 16 / 24, card shadow `0 2px 10px rgba(15, 61, 46, 0.06)`, 8 px spacing rhythm.
- Mobile dark mode uses only kit colours (page `#0B3024`, surfaces `#0F3D2E`, actions `#22C55E`).

## Logo use
| Place | Asset |
|---|---|
| Admin sidebar (desktop) | `public/brand/logo-horizontal.svg` |
| Admin sign-in / two-step pages | `public/brand/logo-stacked.svg` |
| Admin top bar (phone), favicon | `icon-transparent.svg`; `app/icon.png` + `app/apple-icon.png` from the kit's app icon |
| App sign-in | `assets/brand/logo-stacked.png` |
| App shop selection / creation | `assets/brand/logo-horizontal.png` |
| App header (every shop tab) | `assets/brand/icon-transparent.png` |
| App launcher icon | `assets/icon.png`, adaptive `android-icon-*.png` — generated from the kit's `app-icon.svg` (same shapes and colours; mark centred in Android's safe zone; monochrome version with the arrow cut out for themed icons) |
| Splash | `logo-stacked.png` on `#F8FAFC`; dark mode: `app-icon-1024.png` on `#0F3D2E` |

The app uses the kit's PNG exports: its SVGs set the wordmark in live text, which a phone may draw in another font.

## Kit issues to send back to the designer
1. **`logo-monochrome.svg`**: "Saathi" and the arrow are white, so on light backgrounds the logo reads "Dukaan"
   and a blank bag. Not used.
2. **`logo-dark-background.svg`**: the bag handle is forest green and disappears on dark surfaces. Not used; the
   app icon (white mark on forest) is used on dark surfaces instead.
3. The SVG wordmarks are live text (Inter). Outline the text before print or final release, as the kit's README says.
4. The kit has no dark-mode palette; the app derives one from kit colours only (above).
