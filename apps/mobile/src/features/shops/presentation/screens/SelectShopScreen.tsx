import { ScrollView, StyleSheet } from 'react-native';
import { Card, HelperText, List, Text } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { spacing } from '@/shared/theme/theme';
import type { ShopActivation } from '../../domain/entities/Shop';
import { type SelectShopViewModelDeps, useSelectShopViewModel } from '../viewmodels/useSelectShopViewModel';

export function SelectShopScreen({
  deps,
  onActivated,
  onCreateShop,
  onSignOut,
}: {
  deps: SelectShopViewModelDeps;
  onActivated: (activation: ShopActivation) => void;
  onCreateShop: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useSelectShopViewModel(deps, onActivated);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error')
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;

  const nothingYet = state.memberships.length === 0 && state.invitations.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandLogo variant="horizontal" width={200} style={styles.logo} />
      <Text variant="headlineSmall" accessibilityRole="header">
        {nothingYet ? t('shops.select.welcome') : t('shops.select.title')}
      </Text>

      {state.invitations.length > 0 ? (
        <Card style={styles.card}>
          <Card.Title title={t('shops.select.invitations')} />
          {state.invitations.map((inv) => (
            <List.Item
              key={inv.invitationId}
              title={inv.shopName}
              description={t(`roles.${inv.role}`)}
              right={() => (
                <Button
                  mode="contained"
                  loading={state.busyId === inv.invitationId}
                  disabled={state.busyId !== null}
                  onPress={() => actions.accept(inv)}
                >
                  {t('shops.select.join')}
                </Button>
              )}
            />
          ))}
        </Card>
      ) : null}

      {state.memberships.map((m) => (
        <Card
          key={m.shopId}
          style={styles.card}
          onPress={() => actions.openShop(m)}
          disabled={state.busyId !== null}
        >
          <Card.Title
            title={m.shopName}
            subtitle={m.shopStatus === 'suspended' ? t('shops.select.suspended') : t(`roles.${m.role}`)}
            right={() =>
              state.busyId === m.shopId ? <Text style={styles.opening}>{t('common.loading')}</Text> : null
            }
          />
        </Card>
      ))}

      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>

      <Button
        mode={nothingYet ? 'contained' : 'outlined'}
        onPress={onCreateShop}
        contentStyle={styles.button}
      >
        {t('shops.select.create')}
      </Button>
      {nothingYet ? (
        <Text variant="bodyMedium" style={styles.hint}>
          {t('shops.select.staffHint')}
        </Text>
      ) : null}
      <Button mode="text" onPress={onSignOut} style={styles.signOut}>
        {t('more.signOut')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Horizontal logo 1000×260 includes its own clear space on the right, so it sits left-aligned with the title.
  logo: { marginLeft: -6, marginBottom: spacing.sm },
  container: { padding: spacing.md, gap: spacing.md },
  card: { marginTop: spacing.xs },
  opening: { marginRight: spacing.md },
  button: { minHeight: 48 },
  hint: { textAlign: 'center' },
  signOut: { marginTop: spacing.lg },
});
