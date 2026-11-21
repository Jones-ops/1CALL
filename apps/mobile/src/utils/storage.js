// Small persistent key/value store: the secure keystore on phones,
// localStorage in the browser preview (used for UI checks).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const storage =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k, v) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k) => globalThis.localStorage?.removeItem(k),
      }
    : SecureStore;
