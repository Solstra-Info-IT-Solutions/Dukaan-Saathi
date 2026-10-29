import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Icon, List, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { cardShadow, radius } from '@/shared/theme/brand';
import { MIN_TOUCH_TARGET, spacing } from '@/shared/theme/theme';
import type { ShopActivation } from '../../domain/entities/Shop';
import { type ShopHomeViewModelDeps, useShopHomeViewModel } from '../viewmodels/useShopHomeViewModel';

/** A shortcut to a screen the member may open (the route decides which ones, from permissions). */
export interface HomeShortcut {
  key: string;
  labelKey: string;
  icon: string;
  onPress: () => void;
}

/** Home tab: the shop, shortcuts to the daily work, who you are here and the plan status. */
export function ShopHomeScreen({
  deps,
  shop,
  onOpenPlan,
  shortcuts = [],
}: {
  deps: ShopHomeViewModelDeps;
  shop: ShopActivation;
  /** Members who may see the plan open the plan screen from the plan row. */
  onOpenPlan?: () => void;
  shortcuts?: HomeShortcut[];
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state } = useShopHomeViewModel(deps, shop);

  const planText = state.plan
    ? state.plan.trialDaysLeft !== null
      ? t('shops.home.trialDays', { count: state.plan.trialDaysLeft })
      : t(`shops.home.planStatus.${state.plan.status}`)
    : state.planErrorKey
      ? t(state.planErrorKey)
      : t('common.loading');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.hero, { backgroundColor: theme.colors.inverseSurface }]}>
        <Text
          variant="headlineSmall"
          accessibilityRole="header"
          style={{ color: theme.colors.inverseOnSurface }}
        >
          {state.shop.shopName}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.inversePrimary }}>
          {t('app.tagline')}
        </Text>
      </View>

      {shortcuts.length > 0 ? (
        <View style={styles.grid}>
          {shortcuts.map((s) => (
            <Pressable
              key={s.key}
              onPress={s.onPress}
              accessibilityRole="button"
              accessibilityLabel={t(s.labelKey)}
              style={({ pressed }) => [
                styles.tile,
                cardShadow,
                {
                  backgroundColor: pressed ? theme.colors.surfaceVariant : theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <View style={[styles.tileIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                <Icon source={s.icon} size={24} color={theme.colors.onSecondaryContainer} />
              </View>
              <Text variant="titleSmall">{t(s.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card mode="outlined" style={styles.card}>
        <List.Item title={t('shops.home.role')} description={t(`roles.${state.shop.role}`)} />
        <List.Item title={t('shops.home.device')} description={state.invoiceSeries} />
        <List.Item
          title={t('shops.home.plan')}
          description={planText}
          onPress={onOpenPlan}
          right={onOpenPlan ? (props) => <List.Icon {...props} icon="chevron-right" /> : undefined}
          accessibilityRole={onOpenPlan ? 'button' : undefined}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  hero: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: MIN_TOUCH_TARGET * 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: radius.lg },
});
