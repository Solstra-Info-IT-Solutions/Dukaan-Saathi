/**
 * Dukaan Saathi brand tokens — the exact values of the Brand Kit (docs/brand/design-tokens.css,
 * docs/brand/color-palette.json). Change them there first; this file mirrors them for React Native.
 */
export const brand = {
  primary: '#0F3D2E', // forest: brand anchors, headers, active navigation
  primaryHover: '#0B3024',
  green: '#22C55E', // action green: primary call to action (with forest label), positive indicators
  greenDark: '#16A34A',
  greenLight: '#A7F3D0', // selected states
  greenTint: '#F0FDF4', // subtle highlights
  accentYellow: '#FACC15', // promotional only
  accentOrange: '#FB923C', // promotional only
} as const;

export const neutral = {
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  surfaceSoft: '#F9FAFB',
} as const;

export const semantic = {
  success: '#15803D',
  successBackground: '#DCFCE7',
  warning: '#B45309',
  warningBackground: '#FEF3C7',
  error: '#B91C1C',
  errorBackground: '#FEE2E2',
  info: '#1D4ED8',
  infoBackground: '#DBEAFE',
} as const;

/** Kit radii (dp): 8 small, 12 medium (controls), 16 cards, 24 promotional panels. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The kit's card shadow `0 2px 10px rgba(15, 61, 46, 0.06)` as React Native shadow props. */
export const cardShadow = {
  shadowColor: brand.primary,
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

/** Embedded with the expo-font config plugin (app.json), weights 400/500/600/700. */
export const fontFamily = 'Inter';
