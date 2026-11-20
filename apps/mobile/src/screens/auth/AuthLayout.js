import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_BLUE, useTheme } from '../../theme';
import Logo from '../../components/Logo';
import { Card, H1, MockBanner, Sub } from '../../components/ui';

/** The prototype's centred login card with the logo on a blue pill. */
export default function AuthLayout({ title, sub, children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <MockBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 40, paddingBottom: 40 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <View
              style={{
                backgroundColor: BRAND_BLUE,
                padding: 10,
                borderRadius: 10,
                alignSelf: 'flex-start',
                marginBottom: 14,
              }}
            >
              <Logo />
            </View>
            <H1>{title}</H1>
            <Sub>{sub}</Sub>
            {children}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
