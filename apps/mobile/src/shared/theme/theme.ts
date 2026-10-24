import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Design tokens. Screens use the Paper theme through shared components only, so the UI kit stays
 * replaceable (DECISIONS.md OD-09). Large touch targets: minimum 48 dp (NFR-08).
 */

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const MIN_TOUCH_TARGET = 48;

const brand = {
  primary: '#0B6E4F',
  secondary: '#F2A541',
  error: '#B3261E',
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: brand.primary, secondary: brand.secondary, error: brand.error },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, primary: '#5FD3A6', secondary: brand.secondary },
};
