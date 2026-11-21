import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeValue } from './src/theme';
import { AuthProvider } from './src/context/AuthContext';
import { I18nProvider } from './src/i18n';
import { ToastProvider } from './src/components/Toast';
import RootNavigator from './src/navigation';

export default function App() {
  const theme = useThemeValue();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style={theme.dark ? 'light' : 'dark'} />
              <RootNavigator />
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
