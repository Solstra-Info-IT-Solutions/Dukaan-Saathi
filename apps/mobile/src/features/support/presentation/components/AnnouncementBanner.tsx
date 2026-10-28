import { StyleSheet, View } from 'react-native';
import { Banner } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import {
  type AnnouncementsViewModelDeps,
  useAnnouncementsViewModel,
} from '../viewmodels/useSupportViewModels';

const ICON = { info: 'information-outline', warning: 'alert-outline', critical: 'alert-octagon' } as const;

/** Published announcements from our team (maintenance, new features). Critical ones cannot be dismissed. */
export function AnnouncementBanner({ deps }: { deps: AnnouncementsViewModelDeps }) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useAnnouncementsViewModel(deps, i18n.language === 'hi' ? 'hi' : 'en');
  if (state.announcements.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {state.announcements.map(({ id, severity, title, body }) => {
        return (
          <Banner
            key={id}
            visible
            icon={ICON[severity]}
            actions={
              severity === 'critical'
                ? []
                : [{ label: t('common.dismiss'), onPress: () => actions.dismiss(id) }]
            }
            accessibilityRole="alert"
          >
            {body ? `${title}\n${body}` : title}
          </Banner>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 1 } });
