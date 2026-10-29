import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { spacing } from '@/shared/theme/theme';
import type { OtpChannel, OtpDestination } from '../../domain/entities/AuthSession';
import { type LoginViewModelDeps, useLoginViewModel } from '../viewmodels/useLoginViewModel';

export function LoginScreen({
  deps,
  onCodeSent,
  onOpenDiagnostics,
}: {
  deps: LoginViewModelDeps;
  onCodeSent: (destination: OtpDestination) => void;
  onOpenDiagnostics: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useLoginViewModel(deps);
  const isPhone = state.channel === 'phone';

  const submit = async () => {
    const destination = await actions.submit();
    if (destination) onCodeSent(destination);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* The stacked logo carries the name and the tagline; it is announced as the app name. */}
        <BrandLogo variant="stacked" width={220} style={styles.logo} />
        <Text variant="titleMedium" accessibilityRole="header" style={styles.subtitle}>
          {t('auth.login.subtitle')}
        </Text>

        <SegmentedButtons
          value={state.channel}
          onValueChange={(v) => actions.setChannel(v as OtpChannel)}
          buttons={[
            { value: 'phone', label: t('auth.login.phone') },
            { value: 'email', label: t('auth.login.email') },
          ]}
        />

        <TextInput
          mode="outlined"
          style={styles.input}
          label={isPhone ? t('auth.login.phoneLabel') : t('auth.login.emailLabel')}
          accessibilityLabel={isPhone ? t('auth.login.phoneLabel') : t('auth.login.emailLabel')}
          value={state.value}
          onChangeText={actions.setValue}
          keyboardType={isPhone ? 'phone-pad' : 'email-address'}
          autoCapitalize="none"
          autoComplete={isPhone ? 'tel' : 'email'}
          left={isPhone ? <TextInput.Affix text="+91" /> : undefined}
          error={state.status === 'error'}
          onSubmitEditing={submit}
        />
        <HelperText type="error" visible={state.errorKey !== null}>
          {state.errorKey ? t(state.errorKey) : ''}
        </HelperText>

        <Button
          mode="contained"
          onPress={submit}
          loading={state.status === 'sending'}
          disabled={state.status === 'sending' || state.value.trim().length === 0}
          contentStyle={styles.button}
        >
          {t('auth.login.sendCode')}
        </Button>

        <Button mode="text" onPress={onOpenDiagnostics} style={styles.secondary}>
          {t('diagnostics.title')}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  logo: { alignSelf: 'center', marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.md, textAlign: 'center' },
  input: { marginTop: spacing.md },
  button: { minHeight: 48 },
  secondary: { marginTop: spacing.lg },
});
