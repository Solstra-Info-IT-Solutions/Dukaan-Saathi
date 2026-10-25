import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes text (e.g. a CSV report) to the cache folder and opens the system share sheet. */
export const fileSharer = {
  async shareText(fileName: string, mimeType: string, content: string): Promise<void> {
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  },
};
