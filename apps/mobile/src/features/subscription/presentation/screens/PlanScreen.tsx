import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, List, ProgressBar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type PlanViewModelDeps, usePlanViewModel } from '../viewmodels/usePlanViewModel';

/**
 * The shop's plan: status, days left, usage against limits, what is included, and how to upgrade (outside the app
 * for now, OD-05). Billing keeps working on every plan, including after a plan ends.
 */
export function PlanScreen({
  deps,
  shopId,
  shopName,
}: {
  deps: PlanViewModelDeps;
  shopId: string;
  shopName: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { state, actions } = usePlanViewModel(deps, shopId, shopName, t('plan.upgradeMessage'));

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;
  if (state.loading || !state.summary) return <LoadingState />;
  const s = state.summary;
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const planName = s.planName ? (s.planName[lang] ?? s.planName.en) : s.planCode;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" accessibilityRole="header">
        {planName}
      </Text>
      <Text variant="bodyLarge">
        {t(`shops.home.planStatus.${s.status}`)}
        {s.daysLeft !== null ? ` · ${t('plan.daysLeft', { count: s.daysLeft })}` : ''}
      </Text>
      {s.needsAttention ? (
        <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
          <Card.Content>
            <Text variant="bodyMedium">{t(`plan.attention.${s.status}`)}</Text>
          </Card.Content>
        </Card>
      ) : null}

      <Text variant="titleMedium">{t('plan.usage')}</Text>
      {s.usage.map((u) => (
        <View key={u.key} style={styles.usage}>
          <View style={styles.row}>
            <Text variant="bodyMedium">{t(`plan.limits.${u.key}`)}</Text>
            <Text variant="bodyMedium" style={u.atLimit ? { color: theme.colors.error } : undefined}>
              {u.limit === null
                ? t('plan.ofUnlimited', { used: u.used })
                : t('plan.of', { used: u.used, limit: u.limit })}
            </Text>
          </View>
          {u.limit !== null ? (
            <ProgressBar
              progress={u.fraction}
              color={u.atLimit ? theme.colors.error : undefined}
              accessibilityLabel={t(`plan.limits.${u.key}`)}
            />
          ) : null}
        </View>
      ))}

      <Text variant="titleMedium">{t('plan.included')}</Text>
      <Card>
        {s.features.map((f) => (
          <List.Item
            key={f.key}
            title={t(`plan.features.${f.key}`)}
            left={(props) => (
              <List.Icon {...props} icon={f.included ? 'check-circle-outline' : 'lock-outline'} />
            )}
            description={f.included ? undefined : t('plan.notIncluded')}
          />
        ))}
      </Card>

      <Text variant="titleMedium">{t('plan.upgradeTitle')}</Text>
      <Text variant="bodyMedium">{t('plan.upgradeBody')}</Text>
      {state.hours ? <Text variant="bodySmall">{state.hours[lang] ?? state.hours.en}</Text> : null}
      {state.hasWhatsapp ? (
        <Button
          mode="contained"
          icon="whatsapp"
          onPress={actions.contactWhatsapp}
          contentStyle={styles.button}
        >
          {t('plan.whatsapp')}
        </Button>
      ) : null}
      {state.phone ? (
        <Button mode="outlined" icon="phone" onPress={actions.call} contentStyle={styles.button}>
          {t('plan.call')}
        </Button>
      ) : null}
      {!state.hasWhatsapp && !state.phone ? <Text variant="bodySmall">{t('plan.noContact')}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  usage: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { minHeight: 48 },
});
