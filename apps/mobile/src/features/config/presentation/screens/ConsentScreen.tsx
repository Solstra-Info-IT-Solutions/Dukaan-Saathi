import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { HelperText, Text } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import { type ConsentViewModelDeps, useConsentViewModel } from '../viewmodels/useConsentViewModel';

function Links({ onPrivacy, onTerms }: { onPrivacy: () => void; onTerms: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Button mode="outlined" icon="shield-account-outline" onPress={onPrivacy} contentStyle={styles.button}>
        {t('legal.privacy')}
      </Button>
      <Button mode="outlined" icon="file-document-outline" onPress={onTerms} contentStyle={styles.button}>
        {t('legal.terms')}
      </Button>
    </>
  );
}

/**
 * After sign-in: when a privacy policy / terms version is published that this user has not accepted, only this
 * screen is shown (accept, read, or sign out). Otherwise the app.
 */
export function ConsentGate({
  deps,
  onSignOut,
  children,
}: {
  deps: ConsentViewModelDeps;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { state, actions } = useConsentViewModel(deps);
  if (!state.required) return <>{children}</>;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('legal.title')}
      </Text>
      <Text variant="bodyLarge">{t('legal.body')}</Text>
      <Links onPrivacy={actions.openPrivacy} onTerms={actions.openTerms} />
      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.accept}
        loading={state.accepting}
        disabled={state.accepting}
        contentStyle={styles.button}
      >
        {t('legal.accept')}
      </Button>
      <Button mode="text" onPress={onSignOut} contentStyle={styles.button}>
        {t('more.signOut')}
      </Button>
    </ScrollView>
  );
}

/** More → Privacy & terms: the links and when this user accepted them. */
export function LegalScreen({ deps }: { deps: ConsentViewModelDeps }) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useConsentViewModel(deps);
  const c = state.consent;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {c?.currentVersion ? (
        <>
          <Links onPrivacy={actions.openPrivacy} onTerms={actions.openTerms} />
          <Text variant="bodySmall">
            {c.acceptedAt
              ? t('legal.acceptedOn', {
                  version: c.acceptedVersion,
                  date: new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
                    dateStyle: 'medium',
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date(c.acceptedAt)),
                })
              : ''}
          </Text>
        </>
      ) : (
        <Text variant="bodyMedium">{t('legal.notPublished')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  button: { minHeight: 48 },
});
