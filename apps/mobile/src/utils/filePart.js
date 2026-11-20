// Attach a local file to a multipart upload.
//
// Expo SDK 58's fetch (expo/fetch) rejects React Native's old
// `{ uri, name, type }` form parts ("Unsupported FormDataPart implementation").
// It accepts Blob-like objects, and expo-file-system's File is one.
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/**
 * @param {FormData} form
 * @param {string} field   form field name, e.g. "file"
 * @param {{ uri: string, name: string, webFile?: Blob }} file
 */
export async function appendFile(form, field, { uri, name, webFile }) {
  if (Platform.OS === 'web') {
    // Browser preview: the picker gives a real File; recordings are blob: URLs.
    const blob = webFile ?? (await (await fetch(uri)).blob());
    form.append(field, blob, name);
    return;
  }
  form.append(field, new File(uri), name);
}
