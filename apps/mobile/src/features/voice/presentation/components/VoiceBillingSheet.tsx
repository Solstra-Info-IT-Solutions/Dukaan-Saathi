import { formatPaise, formatQuantity, paise, quantityMilli } from '@ds/domain-core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  HelperText,
  IconButton,
  List,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { VoiceLine, VoiceProduct } from '../../domain/matcher';
import {
  type ConfirmedVoiceLine,
  useVoiceBillingViewModel,
  type VoiceBillingViewModelDeps,
} from '../viewmodels/useVoiceBillingViewModel';

/**
 * Mic button + review sheet. Speak "do kilo aata aur pachaas rupaye ka dhaniya" → lines to check → Add to bill.
 * Typing the same sentence works too (no microphone, or a noisy shop).
 */
export function VoiceBillingSheet<T extends VoiceProduct>({
  deps,
  shopId,
  canLearn,
  onConfirm,
}: {
  deps: VoiceBillingViewModelDeps<T>;
  shopId: string;
  canLearn: boolean;
  onConfirm: (lines: ConfirmedVoiceLine<T>[]) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state, actions } = useVoiceBillingViewModel(deps, shopId, canLearn, onConfirm);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const close = () => {
    actions.cancel();
    setOpen(false);
  };
  const quantity = (l: VoiceLine<T>) =>
    l.amountPaise !== null
      ? t('voice.worth', { amount: formatPaise(paise(l.amountPaise)) })
      : l.quantityMilli !== null && l.product
        ? `${formatQuantity(quantityMilli(l.quantityMilli))} ${t(`billing.units.${l.product.unitCode}`, { defaultValue: l.product.unitCode })}`
        : '';

  return (
    <>
      <IconButton
        icon="microphone"
        mode="contained"
        accessibilityLabel={t('voice.open')}
        onPress={() => {
          setOpen(true);
          void actions.start();
        }}
      />
      <Portal>
        <Modal
          visible={open}
          onDismiss={close}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text variant="titleLarge" accessibilityRole="header">
              {t('voice.title')}
            </Text>
            {state.phase === 'listening' ? (
              <>
                <Text variant="bodyLarge">{state.partial || t('voice.listening')}</Text>
                <Button mode="contained" icon="stop" onPress={actions.stop}>
                  {t('voice.done')}
                </Button>
              </>
            ) : null}
            {state.phase === 'processing' ? <Text variant="bodyLarge">{t('voice.processing')}</Text> : null}
            {state.error ? (
              <HelperText type="error" visible>
                {t(`voice.errors.${state.error}`)}
              </HelperText>
            ) : null}
            {state.transcript ? <Text variant="bodySmall">“{state.transcript}”</Text> : null}

            {state.lines.map((l) => (
              <View key={l.key} style={styles.line}>
                <List.Item
                  title={
                    l.product
                      ? l.product.name
                      : t('voice.notFound', { words: l.phrase.itemText || l.phrase.raw })
                  }
                  description={[quantity(l), l.status === 'check' ? t('voice.check') : null]
                    .filter(Boolean)
                    .join(' · ')}
                  right={() => (
                    <IconButton
                      icon="close"
                      accessibilityLabel={t('voice.remove', { words: l.phrase.raw })}
                      onPress={() => actions.remove(l.key)}
                    />
                  )}
                />
                {l.status !== 'ok' && l.alternatives.length > 0 ? (
                  <View style={styles.chips}>
                    {l.alternatives.map((p) => (
                      <Chip key={p.id} compact onPress={() => actions.choose(l.key, p)}>
                        {p.name}
                      </Chip>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

            {state.phase !== 'listening' ? (
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  dense
                  style={styles.flex}
                  label={t('voice.type')}
                  accessibilityLabel={t('voice.type')}
                  value={typed}
                  onChangeText={setTyped}
                  onSubmitEditing={() => {
                    if (typed.trim()) void actions.submitText(typed);
                    setTyped('');
                  }}
                />
                <IconButton
                  icon="microphone"
                  accessibilityLabel={t('voice.speakAgain')}
                  onPress={() => void actions.start()}
                />
              </View>
            ) : null}
            {state.unmatched > 0 ? <HelperText type="info">{t('voice.unmatchedHint')}</HelperText> : null}
            <Button
              mode="contained"
              onPress={() => {
                actions.confirm();
                setOpen(false);
              }}
              disabled={!state.canConfirm || state.phase === 'listening' || state.phase === 'processing'}
              contentStyle={styles.big}
            >
              {t('voice.addToBill')}
            </Button>
            <Button mode="text" onPress={close}>
              {t('common.cancel')}
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: spacing.md, borderRadius: 12, maxHeight: '90%' },
  body: { padding: spacing.md, gap: spacing.sm },
  line: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  big: { minHeight: 56 },
});
