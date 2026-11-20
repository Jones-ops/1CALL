import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render } from '@testing-library/react-native';
import { ThemeProvider, light } from './src/theme';
import { AuthContext } from './src/context/AuthContext';

const Stack = createNativeStackNavigator();

export const authValue = {
  user: {
    id: 'u1',
    name: 'Grace',
    phone: '+254712000111',
    role: 'owner',
    org: { name: 'Hope', verified: true },
  },
  ready: true,
  isAdmin: false,
  signIn: jest.fn(),
  signOut: jest.fn(),
  appConfig: {
    mockMode: true,
    mockPayments: true,
    bannerText: 'MOCK MODE – no real phone calls and no real M-Pesa payments.',
  },
};

/** Render a screen inside the providers it needs (theme, auth, navigation, safe area). */
export async function renderScreen(Component, { params, extraScreens = {} } = {}) {
  const metrics = {
    frame: { x: 0, y: 0, width: 360, height: 760 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider value={{ colors: light, dark: false }}>
        <AuthContext.Provider value={authValue}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Main" component={Component} initialParams={params} />
              {Object.entries(extraScreens).map(([name, C]) => (
                <Stack.Screen key={name} name={name} component={C} />
              ))}
            </Stack.Navigator>
          </NavigationContainer>
        </AuthContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
