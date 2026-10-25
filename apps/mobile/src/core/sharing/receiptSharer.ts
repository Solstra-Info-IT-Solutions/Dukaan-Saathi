import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Share } from 'react-native';

/**
 * Sends receipts out of the app: PDF through the system share sheet, text through WhatsApp
 * (falls back to the share sheet when WhatsApp is not installed).
 */
export interface Sharer {
  sharePdf(html: string, fileName: string): Promise<void>;
  shareText(text: string): Promise<void>;
}

export const receiptSharer: Sharer = {
  async sharePdf(html, fileName) {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf',
    });
  },
  async shareText(text) {
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    if (await Linking.canOpenURL(url).catch(() => false)) {
      await Linking.openURL(url);
      return;
    }
    await Share.share({ message: text });
  },
};
