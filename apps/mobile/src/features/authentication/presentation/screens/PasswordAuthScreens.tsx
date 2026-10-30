import { StyleSheet, View } from 'react-native';
import { Divider, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/shared/components/AuthLayout';
import { Button } from '@/shared/components/Button';
import { PasswordInput } from '@/shared/components/PasswordInput';
import { spacing } from '@/shared/theme/theme';
import {
  MIN_PASSWORD_LENGTH,
  type SignUpResult,
  type ForgotPasswordViewModelDeps,
  type PasswordLoginViewModelDeps,
  type RegisterViewModelDeps,
  useForgotPasswordViewModel,
  usePasswordLoginViewModel,
  useRegisterViewModel,
} from '../viewmodels/usePasswordAuthViewModels';

function EmailInput({
  value,
  onChangeText,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TextInput
      mode="outlined"
      label={t('auth.login.emailLabel')}
      accessibilityLabel={t('auth.login.emailLabel')}
      value={value}
      onChangeText={onChangeText}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      left={<TextInput.Icon icon="email-outline" />}
      onSubmitEditing={onSubmitEditing}
      returnKeyType="next"
    />
  );
}

function ErrorText({ errorKey }: { errorKey: string | null }) {
  const { t } = useTranslation();
  return (
    <HelperText type="error" visible={errorKey !== null}>
      {errorKey ? t(errorKey, { min: MIN_PASSWORD_LENGTH }) : ''}
    </HelperText>
  );
}

/** Sign in with email and password; links to forgot password, a one-time code, and a new account. */
export function PasswordLoginScreen({
  deps,
  onForgot,
  onRegister,
  onUseCode,
}: {
  deps: PasswordLoginViewModelDeps;
  onForgot: (email: string) => void;
  onRegister: () => void;
  onUseCode: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = usePasswordLoginViewModel(deps);
  return (
    <AuthLayout
      title={t('auth.password.signInTitle')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          <Text variant="bodyMedium">{t('auth.password.newHere')}</Text>
          <Button mode="outlined" icon="storefront-outline" onPress={onRegister} style={styles.wide}>
            {t('auth.password.registerShop')}
          </Button>
        </>
      }
    >
      <EmailInput value={state.email} onChangeText={actions.setEmail} />
      <PasswordInput
        label={t('auth.password.label')}
        value={state.password}
        onChangeText={actions.setPassword}
        onSubmitEditing={actions.submit}
        returnKeyType="go"
      />
      <View style={styles.right}>
        <Button mode="text" compact onPress={() => onForgot(state.email)}>
          {t('auth.password.forgot')}
        </Button>
      </View>
      <ErrorText errorKey={state.errorKey} />
      <Button
        mode="contained"
        onPress={actions.submit}
        loading={state.busy}
        disabled={state.busy}
        contentStyle={styles.button}
      >
        {t('auth.password.signIn')}
      </Button>
      <View style={styles.divider}>
        <Divider style={styles.flex} />
        <Text variant="labelMedium" style={styles.or}>
          {t('auth.password.or')}
        </Text>
        <Divider style={styles.flex} />
      </View>
      <Button mode="outlined" icon="message-text-outline" onPress={onUseCode} contentStyle={styles.button}>
        {t('auth.password.useCode')}
      </Button>
    </AuthLayout>
  );
}

/** Create an account for a shop owner; the shop is set up right after (onboarding). */
export function RegisterScreen({
  deps,
  onDone,
  onSignIn,
}: {
  deps: RegisterViewModelDeps;
  /** Called with the result; signed-in users continue automatically, others confirm their email first. */
  onDone: (result: SignUpResult) => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useRegisterViewModel(deps);
  const submit = async () => {
    const result = await actions.submit();
    if (result) onDone(result);
  };
  return (
    <AuthLayout
      logo="horizontal"
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <Button mode="text" onPress={onSignIn}>
          {t('auth.register.haveAccount')}
        </Button>
      }
    >
      <TextInput
        mode="outlined"
        label={t('auth.register.name')}
        accessibilityLabel={t('auth.register.name')}
        value={state.name}
        onChangeText={actions.setName}
        autoComplete="name"
        textContentType="name"
        left={<TextInput.Icon icon="account-outline" />}
        maxLength={80}
      />
      <EmailInput value={state.email} onChangeText={actions.setEmail} />
      <PasswordInput
        isNew
        label={t('auth.password.newLabel')}
        value={state.password}
        onChangeText={actions.setPassword}
      />
      <PasswordInput
        isNew
        label={t('auth.password.confirmLabel')}
        value={state.confirm}
        onChangeText={actions.setConfirm}
        onSubmitEditing={submit}
      />
      <Text variant="bodySmall" style={styles.hint}>
        {t('auth.password.rule', { min: MIN_PASSWORD_LENGTH })}
      </Text>
      <ErrorText errorKey={state.errorKey} />
      <Button
        mode="contained"
        onPress={submit}
        loading={state.busy}
        disabled={state.busy}
        contentStyle={styles.button}
      >
        {t('auth.register.create')}
      </Button>
    </AuthLayout>
  );
}

/** Forgot password: email → code from the email + new password. */
export function ForgotPasswordScreen({
  deps,
  initialEmail,
  onBack,
}: {
  deps: ForgotPasswordViewModelDeps;
  initialEmail?: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useForgotPasswordViewModel(deps, initialEmail);
  return (
    <AuthLayout
      logo="horizontal"
      title={t('auth.forgot.title')}
      subtitle={
        state.step === 'email' ? t('auth.forgot.subtitle') : t('auth.forgot.codeSent', { email: state.email })
      }
      footer={
        <Button mode="text" onPress={state.step === 'email' ? onBack : actions.back}>
          {state.step === 'email' ? t('auth.forgot.backToSignIn') : t('auth.forgot.changeEmail')}
        </Button>
      }
    >
      {state.step === 'email' ? (
        <>
          <EmailInput
            value={state.email}
            onChangeText={actions.setEmail}
            onSubmitEditing={actions.sendCode}
          />
          <ErrorText errorKey={state.errorKey} />
          <Button
            mode="contained"
            onPress={actions.sendCode}
            loading={state.busy}
            disabled={state.busy}
            contentStyle={styles.button}
          >
            {t('auth.forgot.sendCode')}
          </Button>
        </>
      ) : (
        <>
          <TextInput
            mode="outlined"
            label={t('auth.otp.codeLabel')}
            accessibilityLabel={t('auth.otp.codeLabel')}
            value={state.code}
            onChangeText={actions.setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
          />
          <PasswordInput
            isNew
            label={t('auth.password.newLabel')}
            value={state.password}
            onChangeText={actions.setPassword}
          />
          <PasswordInput
            isNew
            label={t('auth.password.confirmLabel')}
            value={state.confirm}
            onChangeText={actions.setConfirm}
            onSubmitEditing={actions.reset}
          />
          <Text variant="bodySmall" style={styles.hint}>
            {t('auth.password.rule', { min: MIN_PASSWORD_LENGTH })}
          </Text>
          <ErrorText errorKey={state.errorKey} />
          <Button
            mode="contained"
            onPress={actions.reset}
            loading={state.busy}
            disabled={state.busy}
            contentStyle={styles.button}
          >
            {t('auth.forgot.save')}
          </Button>
          <Button mode="text" onPress={actions.sendCode} disabled={state.busy}>
            {t('auth.otp.resend')}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch' },
  right: { alignItems: 'flex-end', marginTop: -spacing.xs },
  button: { minHeight: 52 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  or: { opacity: 0.7 },
  hint: { opacity: 0.8 },
});
