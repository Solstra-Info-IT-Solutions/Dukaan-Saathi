import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { OtpDestination } from '../../domain/entities/AuthSession';
import { type OtpViewModelDeps, useOtpViewModel } from '../viewmodels/useOtpViewModel';

export function OtpScreen({
  deps,
  destination,
  onChangeDestination,
}: {
  deps: OtpViewModelDeps;
  destination: OtpDestination;
  onChangeDestination: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useOtpViewModel(deps, destination);
  const shown = destination.kind === 'phone' ? destination.phoneE164 : destination.email;
  const busy = state.status === 'verifying' || state.status === 'resending' || state.status === 'verified';

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('auth.otp.title')}
      </Text>
      <Text variant="bodyLarge">{t('auth.otp.sentTo', { destination: shown })}</Text>

      <TextInput
        mode="outlined"
        style={styles.input}
        label={t('auth.otp.codeLabel')}
        accessibilityLabel={t('auth.otp.codeLabel')}
        value={state.code}
        onChangeText={actions.setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={8}
        error={state.status === 'error'}
        onSubmitEditing={actions.verify}
      />
      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>

      <Button
        mode="contained"
        onPress={actions.verify}
        loading={state.status === 'verifying' || state.status === 'verified'}
        disabled={busy || state.code.length < 6}
        contentStyle={styles.button}
      >
        {t('auth.otp.verify')}
      </Button>
      <Button mode="text" onPress={actions.resend} disabled={busy || state.resendInSeconds > 0}>
        {state.resendInSeconds > 0
          ? t('auth.otp.resendIn', { seconds: state.resendInSeconds })
          : t('auth.otp.resend')}
      </Button>
      <Button mode="text" onPress={onChangeDestination} disabled={busy}>
        {t('auth.otp.change')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  input: { marginTop: spacing.md },
  button: { minHeight: 48 },
});
