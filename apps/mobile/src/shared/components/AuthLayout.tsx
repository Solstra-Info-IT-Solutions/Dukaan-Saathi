import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { cardShadow, radius } from '@/shared/theme/brand';
import { spacing } from '@/shared/theme/theme';
import { BrandLogo } from './BrandLogo';

/**
 * Frame for every sign-in screen: brand logo, then a white card with the form. The card is at most 440 dp wide and
 * centred, so it reads the same on a small phone, a large phone and an iPad (portrait or landscape); the page
 * scrolls when the keyboard is open.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  logo = 'stacked',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  logo?: 'stacked' | 'horizontal' | 'none';
}) {
  const theme = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {logo === 'stacked' ? <BrandLogo variant="stacked" width={200} style={styles.logo} /> : null}
          {logo === 'horizontal' ? <BrandLogo variant="horizontal" width={200} style={styles.logo} /> : null}
          <View
            style={[
              styles.card,
              cardShadow,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
            ]}
          >
            <Text variant="headlineSmall" accessibilityRole="header" style={{ color: theme.colors.primary }}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {subtitle}
              </Text>
            ) : null}
            <View style={styles.body}>{children}</View>
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.md, paddingVertical: spacing.xl },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  logo: { alignSelf: 'center', marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  body: { marginTop: spacing.md, gap: spacing.sm },
  footer: { marginTop: spacing.md, alignItems: 'center', gap: spacing.xs },
});
