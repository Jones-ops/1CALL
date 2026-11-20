import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { BRAND_BLUE, useTheme } from '../theme';
import { Loading } from '../components/ui';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ContactsScreen from '../screens/ContactsScreen';
import RecordScreen from '../screens/RecordScreen';
import CampaignListScreen from '../screens/campaigns/CampaignListScreen';
import CampaignWizardScreen from '../screens/campaigns/CampaignWizardScreen';
import CampaignLiveScreen from '../screens/campaigns/CampaignLiveScreen';
import AccountScreen from '../screens/account/AccountScreen';
import SubscriptionScreen from '../screens/account/SubscriptionScreen';
import PayScreen from '../screens/account/PayScreen';
import PaymentsScreen from '../screens/account/PaymentsScreen';
import AdminScreen from '../screens/admin/AdminScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const noHeader = { headerShown: false };

function CampaignsStack() {
  return (
    <Stack.Navigator screenOptions={noHeader}>
      <Stack.Screen name="CampaignList" component={CampaignListScreen} />
      <Stack.Screen name="CampaignWizard" component={CampaignWizardScreen} />
      <Stack.Screen name="CampaignLive" component={CampaignLiveScreen} />
    </Stack.Navigator>
  );
}

function AccountStack() {
  return (
    <Stack.Navigator screenOptions={noHeader}>
      <Stack.Screen name="AccountHome" component={AccountScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="Pay" component={PayScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
    </Stack.Navigator>
  );
}

const ICONS = {
  Dashboard: 'grid',
  Contacts: 'call',
  Record: 'radio-button-on',
  Campaigns: 'send',
  Account: 'person-circle',
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // The prototype's mobile nav: brand-blue bar, light labels, highlighted active item.
        // Explicit height so icon + label always fit above the phone's navigation bar.
        tabBarStyle: {
          backgroundColor: BRAND_BLUE,
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 6 + insets.bottom,
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#dbe6ff',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { minHeight: 44, borderRadius: 8, marginHorizontal: 2 },
        tabBarActiveBackgroundColor: 'rgba(255,255,255,0.16)',
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? ICONS[route.name] : `${ICONS[route.name]}-outline`}
            size={size - 2}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen
        name="Record"
        component={RecordScreen}
        options={{ title: 'Record', tabBarAccessibilityLabel: 'Record voice' }}
      />
      <Tab.Screen
        name="Campaigns"
        component={CampaignsStack}
        options={{ tabBarAccessibilityLabel: 'Voice campaigns' }}
      />
      <Tab.Screen name="Account" component={AccountStack} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={noHeader}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, ready } = useAuth();
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return (
    <NavigationContainer theme={navTheme}>
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
