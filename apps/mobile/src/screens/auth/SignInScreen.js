import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import { Button, ErrorText, Field, T } from '../../components/ui';
import { useTheme, MIN_TOUCH } from '../../theme';
import AuthLayout from './AuthLayout';

export function TextLink({ title, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={6}
      style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
    >
      <T style={{ color: colors.primary, fontWeight: '600' }}>{title}</T>
    </Pressable>
  );
}

export default function SignInScreen({ navigation }) {
  const { signIn, appConfig } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setUnverified(e.code === 'EMAIL_NOT_VERIFIED');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const r = await api('/auth/resend-verification', {
        method: 'POST',
        body: { email: email.trim() },
        auth: false,
      });
      if (r.devVerifyToken) {
        await api('/auth/verify-email', {
          method: 'POST',
          body: { token: r.devVerifyToken },
          auth: false,
        });
        setInfo('Mock mode: email verified automatically. Sign in again.');
        setUnverified(false);
        setError(null);
      } else {
        setInfo(r.message);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <AuthLayout title="Welcome back" sub="One Message. Thousands of Calls.">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        testID="signin-email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        testID="signin-password"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      {info ? (
        <T tone="success" style={{ marginVertical: 8 }}>
          {info}
        </T>
      ) : null}
      {unverified ? (
        <Button
          title={appConfig?.mockMode ? 'Verify email (mock)' : 'Resend verification email'}
          variant="secondary"
          onPress={resend}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <Button
        title="Sign in"
        onPress={submit}
        loading={busy}
        disabled={!email || !password}
        style={{ marginTop: 14 }}
        testID="signin-submit"
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          marginTop: 8,
        }}
      >
        <TextLink title="Create an account" onPress={() => navigation.navigate('SignUp')} />
        <TextLink title="Forgot password?" onPress={() => navigation.navigate('ForgotPassword')} />
      </View>
      {appConfig?.mockMode ? (
        <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Demo accounts: demo@1call.example / Demo1234! · admin@1call.example / Admin1234!
          (administrator area).
        </T>
      ) : null}
    </AuthLayout>
  );
}
