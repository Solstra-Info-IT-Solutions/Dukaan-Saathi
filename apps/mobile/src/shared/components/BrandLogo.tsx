import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * The Brand Kit's logo exports (PNG; the SVGs set their wordmark in live text, which phones may not render with the
 * right font). Sizes keep each file's own aspect ratio:
 * - `stacked` 600×520 — splash-like, centred screens (sign-in, onboarding)
 * - `horizontal` 1000×260 — wide headers
 * - `icon` 512×512 — compact places
 */
const LOGOS = {
  stacked: { source: require('../../../assets/brand/logo-stacked.png'), ratio: 600 / 520 },
  horizontal: { source: require('../../../assets/brand/logo-horizontal.png'), ratio: 1000 / 260 },
  icon: { source: require('../../../assets/brand/icon-transparent.png'), ratio: 1 },
} as const;

export function BrandLogo({
  variant,
  width,
  style,
}: {
  variant: keyof typeof LOGOS;
  width: number;
  style?: StyleProp<ImageStyle>;
}) {
  const { t } = useTranslation();
  const logo = LOGOS[variant];
  return (
    <Image
      source={logo.source}
      style={[{ width, height: width / logo.ratio }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={t('app.name')}
    />
  );
}
