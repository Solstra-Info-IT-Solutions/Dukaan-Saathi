import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { brand, fontFamily, neutral, radius, semantic } from './brand';

/**
 * Paper themes built only from the Dukaan Saathi Brand Kit (./brand.ts). Screens use the theme through Paper and
 * shared components, so the whole app follows these values. Large touch targets: minimum 48 dp (NFR-08).
 *
 * Contrast (WCAG): white on action green is 2.3:1, so primary buttons use action green with a forest label (5.3:1,
 * shared/components/Button); text buttons, links and focused fields use forest (12:1 on white).
 */

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const MIN_TOUCH_TARGET = 48;

const fonts = configureFonts({ config: { fontFamily } });

/** Flat white surfaces instead of Material's tinted elevation; depth comes from borders and the card shadow. */
const lightElevation = {
  level0: 'transparent',
  level1: neutral.surface,
  level2: neutral.surface,
  level3: neutral.surface,
  level4: neutral.surface,
  level5: neutral.surface,
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: radius.md / 4, // Paper multiplies roundness by 4 for most controls → 12 dp
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: brand.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: brand.green, // FAB and other prominent positive actions
    onPrimaryContainer: brand.primary,
    secondary: brand.greenDark,
    onSecondary: '#FFFFFF',
    secondaryContainer: brand.greenLight, // selected chips, segmented buttons, active tab pill
    onSecondaryContainer: brand.primary,
    tertiary: semantic.info,
    onTertiary: '#FFFFFF',
    tertiaryContainer: semantic.infoBackground,
    onTertiaryContainer: semantic.info,
    error: semantic.error,
    onError: '#FFFFFF',
    errorContainer: semantic.errorBackground,
    onErrorContainer: semantic.error,
    background: neutral.background,
    onBackground: neutral.textPrimary,
    surface: neutral.surface,
    onSurface: neutral.textPrimary,
    surfaceVariant: brand.greenTint,
    onSurfaceVariant: neutral.textSecondary,
    surfaceDisabled: 'rgba(31, 41, 55, 0.12)',
    onSurfaceDisabled: 'rgba(31, 41, 55, 0.38)',
    outline: neutral.textSecondary, // input borders need 3:1 against white (4.8:1)
    outlineVariant: neutral.border, // dividers
    inverseSurface: brand.primary,
    inverseOnSurface: brand.greenTint,
    inversePrimary: brand.green,
    backdrop: 'rgba(15, 61, 46, 0.4)',
    elevation: lightElevation,
  },
};

/**
 * Dark mode uses the kit's own deep greens: page = primary hover, surfaces = forest, actions = action green.
 * The kit defines no separate dark palette, so no other colours are introduced.
 */
export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: radius.md / 4,
  fonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: brand.green,
    onPrimary: brand.primary,
    primaryContainer: brand.green,
    onPrimaryContainer: brand.primary,
    secondary: brand.greenLight,
    onSecondary: brand.primary,
    secondaryContainer: brand.greenDark,
    onSecondaryContainer: '#FFFFFF',
    error: semantic.errorBackground,
    errorContainer: semantic.error,
    onErrorContainer: '#FFFFFF',
    background: brand.primaryHover,
    onBackground: brand.greenTint,
    surface: brand.primary,
    onSurface: brand.greenTint,
    surfaceVariant: brand.primary,
    onSurfaceVariant: brand.greenLight,
    outline: brand.greenLight,
    outlineVariant: 'rgba(167, 243, 208, 0.25)',
    elevation: {
      level0: 'transparent',
      level1: brand.primary,
      level2: brand.primary,
      level3: brand.primary,
      level4: brand.primary,
      level5: brand.primary,
    },
  },
};
