// Colours and shapes taken from the 1CALL prototype.
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

export const light = {
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#0f1b3d',
  muted: '#5b6785',
  border: '#dfe4f0',
  primary: '#0b3a8f',
  accent: '#f58220',
  accentText: '#1a1000',
  success: '#128a4b',
  danger: '#c62828',
  warning: '#9a5b00',
  warningBg: '#fff4e0',
  navText: '#dbe6ff',
  overlay: 'rgba(5,10,30,0.6)',
};

export const dark = {
  bg: '#0b1226',
  card: '#131c36',
  text: '#e8ecf7',
  muted: '#9aa6c4',
  border: '#25304f',
  primary: '#3b73e6',
  accent: '#ff9a3c',
  accentText: '#1a1000',
  success: '#3ecf8e',
  danger: '#ff6b6b',
  warning: '#ffc266',
  warningBg: '#3a2a10',
  navText: '#dbe6ff',
  overlay: 'rgba(0,0,0,0.7)',
};

// The logo, wordmark and navigation bar keep the brand blue in both themes.
export const BRAND_BLUE = '#0b3a8f';
export const BRAND_ORANGE = '#f58220';

export const radius = { card: 12, button: 8, pill: 99, modal: 14 };
export const MIN_TOUCH = 44;

const ThemeContext = createContext({ colors: light, dark: false });

export function useThemeValue() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? dark : light;
  return { colors, dark: scheme === 'dark' };
}

export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);
