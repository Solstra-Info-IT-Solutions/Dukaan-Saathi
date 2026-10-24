import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/** Opens the system file picker for a CSV and reads it as UTF-8 text. Returns null when cancelled. */
export async function pickCsvFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { name: asset.name, text: await new File(asset.uri).text() };
}
