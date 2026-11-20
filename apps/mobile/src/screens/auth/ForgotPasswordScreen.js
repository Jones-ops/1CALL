import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { Button, ErrorText, Field, T } from '../../components/ui';
import AuthLayout from './AuthLayout';
import { TextLink } from './SignInScreen';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
        auth: false,
      });
      if (r.devResetToken) setToken(r.devResetToken); // mock mode only
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token: token.trim(), password },
        auth: false,
      });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password changed" sub="You can now sign in with your new password.">
        <Button title="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset password"
      sub={
        sent
          ? 'Enter the code from the email and choose a new password.'
          : 'We will email you a reset code.'
      }
    >
      {!sent ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title="Send reset code"
            onPress={request}
            loading={busy}
            disabled={!email}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <T tone="muted" style={{ fontSize: 13 }}>
            If an account exists for {email.trim()}, a code is on its way.
          </T>
          <Field
            label="Reset code"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="New password (at least 8 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title="Change password"
            onPress={reset}
            loading={busy}
            disabled={!token || password.length < 8}
            style={{ marginTop: 14 }}
          />
        </>
      )}
      <TextLink title="Back to sign in" onPress={() => navigation.navigate('SignIn')} />
    </AuthLayout>
  );
}
