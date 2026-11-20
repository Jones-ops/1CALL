import Constants from 'expo-constants';
import { Platform } from 'react-native';

// API base URL:
//  1. EXPO_PUBLIC_API_URL (set in .env / eas.json), else
//  2. app.json "extra.apiUrl", else
//  3. in development, the machine running Metro on port 4000.
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra?.apiUrl;
  if (extra) return extra.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();
