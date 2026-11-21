import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_BLUE, useTheme } from '../../theme';
import { LANGUAGES, useI18n } from '../../i18n';
import Logo from '../../components/Logo';
import { Card, H1, SegmentedTabs, Sub } from '../../components/ui';

/** The prototype's centred login card with the logo on a blue pill. */
export default function AuthLayout({ title, sub, children }) {
  const { colors } = useTheme();
  const { lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 32, paddingBottom: 40 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{ alignSelf: 'center', maxWidth: 420, width: '100%', alignItems: 'flex-end' }}
          >
            <SegmentedTabs
              value={lang}
              onChange={setLang}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              testID="auth-language"
            />
          </View>
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
