import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Dialog,
  HelperText,
  List,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { InvitableRole } from '../../domain/entities/Staff';
import { type StaffViewModelDeps, useStaffViewModel } from '../viewmodels/useStaffViewModel';

export function StaffScreen({ deps, shopId }: { deps: StaffViewModelDeps; shopId: string }) {
  const { t } = useTranslation();
  const { state, actions } = useStaffViewModel(deps, shopId);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error')
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('staff.title')}
      </Text>

      <Card>
        <Card.Title title={t('staff.invite.title')} />
        <Card.Content style={styles.gap}>
          <TextInput
            mode="outlined"
            label={t('staff.invite.contact')}
            accessibilityLabel={t('staff.invite.contact')}
            value={state.contact}
            onChangeText={actions.setContact}
            autoCapitalize="none"
            error={state.inviteErrorKey !== null}
          />
          <SegmentedButtons
            value={state.inviteRole}
            onValueChange={(v) => actions.setInviteRole(v as InvitableRole)}
            buttons={[
              { value: 'cashier', label: t('roles.cashier') },
              { value: 'manager', label: t('roles.manager') },
            ]}
          />
          <HelperText type="error" visible={state.inviteErrorKey !== null}>
            {state.inviteErrorKey ? t(state.inviteErrorKey) : ''}
          </HelperText>
          <Button
            mode="contained"
            onPress={actions.invite}
            loading={state.inviting}
            disabled={state.inviting || !state.contact.trim()}
            contentStyle={styles.button}
          >
            {t('staff.invite.send')}
          </Button>
          <Text variant="bodySmall">{t('staff.invite.help')}</Text>
        </Card.Content>
      </Card>

      <HelperText type="error" visible={state.actionErrorKey !== null}>
        {state.actionErrorKey ? t(state.actionErrorKey) : ''}
      </HelperText>

      <Card>
        <Card.Title title={t('staff.members')} />
        {state.members.map((m) => {
          const name = m.displayName ?? m.phone ?? m.email ?? t('staff.unnamed');
          const canEdit = !m.isMe && m.status === 'active';
          return (
            <View key={m.userId}>
              <List.Item
                title={m.isMe ? `${name} (${t('staff.you')})` : name}
                description={
                  m.status === 'active'
                    ? t(`roles.${m.role}`)
                    : `${t(`roles.${m.role}`)} · ${t('staff.deactivated')}`
                }
              />
              {canEdit ? (
                <View style={styles.actions}>
                  {m.role !== 'manager' ? (
                    <Button
                      compact
                      disabled={state.busy}
                      onPress={() => actions.changeRole(m.userId, 'manager')}
                    >
                      {t('staff.makeManager')}
                    </Button>
                  ) : null}
                  {m.role !== 'cashier' ? (
                    <Button
                      compact
                      disabled={state.busy}
                      onPress={() => actions.changeRole(m.userId, 'cashier')}
                    >
                      {t('staff.makeCashier')}
                    </Button>
                  ) : null}
                  <Button compact disabled={state.busy} onPress={() => actions.askDeactivate(m.userId, name)}>
                    {t('staff.deactivate')}
                  </Button>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {state.invitations.length > 0 ? (
        <Card>
          <Card.Title title={t('staff.pending')} />
          {state.invitations.map((i) => (
            <List.Item
              key={i.invitationId}
              title={i.phone ?? i.email ?? ''}
              description={t(`roles.${i.role}`)}
              right={() => (
                <Button
                  compact
                  disabled={state.busy}
                  onPress={() => actions.revokeInvitation(i.invitationId)}
                >
                  {t('staff.revoke')}
                </Button>
              )}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <Card.Title title={t('staff.devices')} />
        {state.devices.map((d) => (
          <List.Item
            key={d.deviceId}
            title={`${t('staff.device')} ${d.deviceCode}${d.label ? ` · ${d.label}` : ''}`}
            description={d.status === 'active' ? d.platform : t('staff.revoked')}
            right={() =>
              d.status === 'active' ? (
                <Button
                  compact
                  disabled={state.busy}
                  onPress={() => actions.askRevokeDevice(d.deviceId, d.deviceCode)}
                >
                  {t('staff.revoke')}
                </Button>
              ) : null
            }
          />
        ))}
      </Card>

      <Portal>
        <Dialog visible={state.confirm !== null} onDismiss={actions.cancelConfirm}>
          <Dialog.Title>{t('staff.confirm.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {state.confirm?.kind === 'deactivate'
                ? t('staff.confirm.deactivate', { name: state.confirm.name })
                : state.confirm?.kind === 'revokeDevice'
                  ? t('staff.confirm.revokeDevice', { code: state.confirm.code })
                  : ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.cancelConfirm}>{t('common.cancel')}</Button>
            <Button onPress={actions.confirm}>{t('common.confirm')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  gap: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm },
  button: { minHeight: 48 },
});
