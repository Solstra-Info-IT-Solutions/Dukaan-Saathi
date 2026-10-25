import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { useBillingViewModel } from '../viewmodels/useBillingViewModel';

type VM = ReturnType<typeof useBillingViewModel>;

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

/**
 * Camera barcode scanner (features/billing.md ScanScreen): asks for permission, adds a known item,
 * and offers to create a product for an unknown code.
 */
export function ScannerSheet({
  state,
  actions,
  onCreateProduct,
}: VM & { onCreateProduct: (barcode: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const scan = state.scan;

  return (
    <Portal>
      <Modal
        visible={scan.kind !== 'closed'}
        onDismiss={actions.closeScanner}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.body}>
          <Text variant="titleLarge" accessibilityRole="header">
            {t('billing.scan.title')}
          </Text>
          {scan.kind === 'unknown' ? (
            <>
              <Text variant="bodyLarge">{t('billing.scan.unknown', { code: scan.code })}</Text>
              {state.canManageProducts ? (
                <Button mode="contained" icon="plus" onPress={() => onCreateProduct(scan.code)}>
                  {t('billing.scan.create')}
                </Button>
              ) : null}
              <Button mode="outlined" onPress={actions.openScanner}>
                {t('billing.scan.again')}
              </Button>
            </>
          ) : permission === null ? null : !permission.granted ? (
            <>
              <Text variant="bodyMedium">
                {permission.canAskAgain ? t('billing.scan.permission') : t('billing.scan.denied')}
              </Text>
              {permission.canAskAgain ? (
                <Button mode="contained" onPress={() => void requestPermission()}>
                  {t('billing.scan.allow')}
                </Button>
              ) : null}
            </>
          ) : (
            <View style={styles.camera}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                onBarcodeScanned={(result) => void actions.scanned(result.data)}
              />
            </View>
          )}
          <Button mode="text" onPress={actions.closeScanner}>
            {t('common.cancel')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: spacing.md, borderRadius: 12 },
  body: { padding: spacing.md, gap: spacing.sm },
  camera: { height: 280, borderRadius: 8, overflow: 'hidden' },
});
