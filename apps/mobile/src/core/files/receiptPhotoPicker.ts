import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
  mimeType: string;
}

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };

function first(result: ImagePicker.ImagePickerResult): PickedPhoto | null {
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' } : null;
}

/** Photo of an expense receipt from the camera or the gallery, compressed. Null when cancelled or denied. */
export const receiptPhotoPicker = {
  async fromCamera(): Promise<PickedPhoto | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    return first(await ImagePicker.launchCameraAsync(OPTIONS));
  },
  async fromLibrary(): Promise<PickedPhoto | null> {
    return first(await ImagePicker.launchImageLibraryAsync(OPTIONS));
  },
};

/** Bytes of a local file (for uploads). */
export function readFileBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
