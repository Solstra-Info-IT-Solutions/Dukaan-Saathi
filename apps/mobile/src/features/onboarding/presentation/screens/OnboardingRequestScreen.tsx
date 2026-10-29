import { ONBOARDING_METHODS } from '@ds/contracts';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { HelperText, IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { OnboardingMethod } from '../../domain/entities/Onboarding';
import {
  type OnboardingRequestViewModelDeps,
  useOnboardingRequestViewModel,
} from '../viewmodels/useOnboardingRequestViewModel';

export function OnboardingRequestScreen({
  deps,
  shopId,
  onSent,
}: {
  deps: OnboardingRequestViewModelDeps;
  shopId: string;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useOnboardingRequestViewModel(deps, shopId, onSent);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="bodyMedium">{t('onboarding.request.intro')}</Text>
      <Text variant="titleMedium">{t('onboarding.request.method')}</Text>
      <SegmentedButtons
        value={state.method}
        onValueChange={(v) => actions.setMethod(v as OnboardingMethod)}
        buttons={ONBOARDING_METHODS.map((m) => ({ value: m, label: t(`onboarding.methods.${m}`) }))}
      />
      <Text variant="bodySmall">{t(`onboarding.methodHelp.${state.method}`)}</Text>

      <TextInput
        mode="outlined"
        keyboardType="phone-pad"
        label={t('onboarding.request.phone')}
        accessibilityLabel={t('onboarding.request.phone')}
        value={state.phoneText}
        onChangeText={actions.setPhoneText}
        maxLength={16}
      />
      <TextInput
        mode="outlined"
        label={t('onboarding.request.preferredTime')}
        accessibilityLabel={t('onboarding.request.preferredTime')}
        value={state.preferredTime}
        onChangeText={actions.setPreferredTime}
        maxLength={80}
      />
      <TextInput
        mode="outlined"
        label={t('onboarding.request.note')}
        accessibilityLabel={t('onboarding.request.note')}
        value={state.note}
        onChangeText={actions.setNote}
        maxLength={500}
        multiline
      />

      <Text variant="titleMedium">{t('onboarding.request.photos', { count: state.photos.length })}</Text>
      <View style={styles.photos}>
        {state.photos.map((p, i) => (
          <View key={`${p.uri}-${i}`}>
            <Image
              source={{ uri: p.uri }}
              style={styles.photo}
              accessibilityLabel={t('onboarding.request.photoLabel', { number: i + 1 })}
            />
            <IconButton
              icon="close"
              size={16}
              style={styles.remove}
              onPress={() => actions.removePhoto(i)}
              accessibilityLabel={t('onboarding.request.removePhoto', { number: i + 1 })}
            />
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Button mode="outlined" icon="camera" onPress={() => void actions.takePhoto()}>
          {t('expenses.takePhoto')}
        </Button>
        <Button mode="text" icon="image" onPress={() => void actions.choosePhoto()}>
          {t('expenses.choosePhoto')}
        </Button>
      </View>

      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.send}
        loading={state.sending}
        disabled={state.sending}
        contentStyle={styles.button}
      >
        {t('onboarding.request.send')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  photo: { width: 80, height: 80, borderRadius: 8 },
  remove: { position: 'absolute', top: -8, right: -8, margin: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: { minHeight: 56 },
});
