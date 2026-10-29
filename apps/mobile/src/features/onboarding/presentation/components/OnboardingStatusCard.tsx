import { StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import {
  type OnboardingStatusViewModelDeps,
  useOnboardingStatusViewModel,
} from '../viewmodels/useOnboardingStatusViewModel';

/** Offer of managed onboarding, its progress, or "your items are ready to check". */
export function OnboardingStatusCard({
  deps,
  shopId,
  canReview,
  onRequest,
  onReview,
}: {
  deps: OnboardingStatusViewModelDeps;
  shopId: string;
  /** Only members who manage items can approve the prepared list. */
  canReview: boolean;
  onRequest: () => void;
  onReview: (importJobId: string) => void;
}) {
  const { t } = useTranslation();
  const { card } = useOnboardingStatusViewModel(deps, shopId).state;
  if (card.kind === 'hidden') return null;

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        {card.kind === 'offer' ? (
          <>
            <Text variant="titleSmall">{t('onboarding.offer.title')}</Text>
            <Text variant="bodyMedium">{t('onboarding.offer.body')}</Text>
          </>
        ) : null}
        {card.kind === 'working' ? (
          <>
            <Text variant="titleSmall">{t('onboarding.working.title')}</Text>
            <Text variant="bodyMedium">{t(`onboarding.status.${card.status}`)}</Text>
          </>
        ) : null}
        {card.kind === 'review' ? (
          <>
            <Text variant="titleSmall">{t('onboarding.review.title')}</Text>
            <Text variant="bodyMedium">{card.note ?? t('onboarding.review.body')}</Text>
          </>
        ) : null}
      </Card.Content>
      {card.kind === 'offer' ? (
        <Card.Actions>
          <Button onPress={onRequest}>{t('onboarding.offer.action')}</Button>
        </Card.Actions>
      ) : null}
      {card.kind === 'review' && canReview ? (
        <Card.Actions>
          <Button mode="contained" onPress={() => onReview(card.importJobId)}>
            {t('onboarding.review.action')}
          </Button>
        </Card.Actions>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  content: { gap: spacing.xs },
});
