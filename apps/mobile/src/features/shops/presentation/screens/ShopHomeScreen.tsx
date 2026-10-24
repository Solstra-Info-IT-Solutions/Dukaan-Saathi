import { ScrollView, StyleSheet } from 'react-native';
import { Card, List, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { ShopActivation } from '../../domain/entities/Shop';
import { type ShopHomeViewModelDeps, useShopHomeViewModel } from '../viewmodels/useShopHomeViewModel';

/** Home tab until billing exists (Phase 04): shows who you are here and the plan status. */
export function ShopHomeScreen({ deps, shop }: { deps: ShopHomeViewModelDeps; shop: ShopActivation }) {
  const { t } = useTranslation();
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
      <Text variant="headlineSmall" accessibilityRole="header">
        {state.shop.shopName}
      </Text>
      <Card>
        <List.Item title={t('shops.home.role')} description={t(`roles.${state.shop.role}`)} />
        <List.Item title={t('shops.home.device')} description={state.invoiceSeries} />
        <List.Item title={t('shops.home.plan')} description={planText} />
      </Card>
      <Card>
        <Card.Content>
          <Text variant="titleMedium">{t('shops.home.billingSoonTitle')}</Text>
          <Text variant="bodyMedium">{t('shops.home.billingSoonBody')}</Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
});
