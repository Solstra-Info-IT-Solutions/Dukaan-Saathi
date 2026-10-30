import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Avatar,
  Card,
  HelperText,
  List,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/components/Button';
import { PasswordInput } from '@/shared/components/PasswordInput';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { radius } from '@/shared/theme/brand';
import { spacing } from '@/shared/theme/theme';
import {
  type ChangePasswordViewModelDeps,
  type ProfileViewModelDeps,
  useChangePasswordViewModel,
  useProfileViewModel,
} from '../viewmodels/useProfileViewModels';

const initials = (name: string | null, fallback: string) =>
  (name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** More → My profile: name, sign-in contact, language, light / dark mode, password, sign out. */
export function ProfileScreen({
  deps,
  onChangePassword,
  onSignOut,
}: {
  deps: ProfileViewModelDeps;
  onChangePassword: (email: string) => void;
  onSignOut: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { state, actions } = useProfileViewModel(deps);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;
  if (state.loading || !state.profile) return <LoadingState />;
  const p = state.profile;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.column}>
        <View style={[styles.hero, { backgroundColor: theme.colors.inverseSurface }]}>
          <Avatar.Text
            size={64}
            label={initials(p.displayName, p.email ?? p.phone ?? '')}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            color={theme.colors.onPrimaryContainer}
          />
          <View style={styles.flex}>
            <Text variant="titleLarge" style={{ color: theme.colors.inverseOnSurface }} numberOfLines={1}>
              {p.displayName || t('profile.noName')}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.inversePrimary }} numberOfLines={1}>
              {p.email ?? p.phone ?? ''}
            </Text>
          </View>
        </View>

        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('profile.details')}</Text>
            <TextInput
              mode="outlined"
              label={t('auth.register.name')}
              accessibilityLabel={t('auth.register.name')}
              value={state.name}
              onChangeText={actions.setName}
              maxLength={80}
              autoComplete="name"
            />
            {p.email ? (
              <List.Item
                title={t('auth.login.emailLabel')}
                description={p.email}
                left={(props) => <List.Icon {...props} icon="email-outline" />}
              />
            ) : null}
            {p.phone ? (
              <List.Item
                title={t('auth.login.phoneLabel')}
                description={p.phone}
                left={(props) => <List.Icon {...props} icon="phone-outline" />}
              />
            ) : null}
            <HelperText type={state.errorKey ? 'error' : 'info'} visible={!!state.errorKey || state.saved}>
              {state.errorKey ? t(state.errorKey) : t('profile.saved')}
            </HelperText>
            <Button
              mode="contained"
              onPress={actions.saveName}
              loading={state.saving}
              disabled={state.saving || !state.nameChanged}
            >
              {t('profile.save')}
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('profile.appearance')}</Text>
            <SegmentedButtons
              value={state.appearance}
              onValueChange={(v) => actions.chooseAppearance(v as 'system' | 'light' | 'dark')}
              buttons={[
                { value: 'light', label: t('profile.light'), icon: 'white-balance-sunny' },
                { value: 'dark', label: t('profile.dark'), icon: 'weather-night' },
                { value: 'system', label: t('profile.system'), icon: 'cellphone' },
              ]}
            />
            <Text variant="titleMedium" style={styles.section}>
              {t('profile.language')}
            </Text>
            <SegmentedButtons
              value={i18n.language === 'hi' ? 'hi' : 'en'}
              onValueChange={(v) => void actions.chooseLanguage(v as 'en' | 'hi')}
              buttons={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिंदी' },
              ]}
            />
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.card}>
          {p.email ? (
            <List.Item
              title={t('profile.changePassword')}
              left={(props) => <List.Icon {...props} icon="lock-reset" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => onChangePassword(p.email!)}
              accessibilityRole="button"
            />
          ) : null}
          <List.Item
            title={t('more.signOut')}
            titleStyle={{ color: theme.colors.error }}
            left={(props) => <List.Icon {...props} icon="logout" color={theme.colors.error} />}
            onPress={onSignOut}
            accessibilityRole="button"
          />
        </Card>
      </View>
    </ScrollView>
  );
}

/** Change password (signed in): the current one is checked before the new one is saved. */
export function ChangePasswordScreen({
  deps,
  email,
  onDone,
}: {
  deps: ChangePasswordViewModelDeps;
  email: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useChangePasswordViewModel(deps, email, onDone);
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={[styles.column, styles.gap]}>
        <Text variant="bodyMedium">{t('profile.passwordIntro', { email })}</Text>
        <PasswordInput
          label={t('profile.currentPassword')}
          value={state.current}
          onChangeText={actions.setCurrent}
        />
        <PasswordInput
          isNew
          label={t('auth.password.newLabel')}
          value={state.next}
          onChangeText={actions.setNext}
        />
        <PasswordInput
          isNew
          label={t('auth.password.confirmLabel')}
          value={state.confirm}
          onChangeText={actions.setConfirm}
          onSubmitEditing={actions.submit}
        />
        <Text variant="bodySmall">{t('auth.password.rule', { min: 8 })}</Text>
        <HelperText type="error" visible={state.errorKey !== null}>
          {state.errorKey ? t(state.errorKey, { min: 8 }) : ''}
        </HelperText>
        <Button
          mode="contained"
          onPress={actions.submit}
          loading={state.busy}
          disabled={state.busy}
          contentStyle={styles.button}
        >
          {t('profile.savePassword')}
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md },
  flex: { flex: 1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  card: { borderRadius: radius.lg },
  gap: { gap: spacing.sm },
  section: { marginTop: spacing.sm },
  button: { minHeight: 52 },
});
