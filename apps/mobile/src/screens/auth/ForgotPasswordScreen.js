import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useI18n } from '../../i18n';
import { Button, ErrorText, Field, T } from '../../components/ui';
import AuthLayout from './AuthLayout';
import { TextLink } from './SignInScreen';

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useI18n();
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
      if (r.devResetToken) setToken(r.devResetToken); // local development only
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
      <AuthLayout title={t('auth.pwChanged')} sub={t('auth.pwChangedSub')}>
        <Button title={t('auth.signIn')} onPress={() => navigation.navigate('SignIn')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      sub={sent ? t('auth.resetSubSent') : t('auth.resetSub')}
    >
      {!sent ? (
        <>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title={t('auth.sendCode')}
            onPress={request}
            loading={busy}
            disabled={!email}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <T tone="muted" style={{ fontSize: 13 }}>
            {t('auth.codeOnWay', { email: email.trim() })}
          </T>
          <Field
            label={t('auth.resetCode')}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title={t('auth.changePassword')}
            onPress={reset}
            loading={busy}
            disabled={!token || password.length < 8}
            style={{ marginTop: 14 }}
          />
        </>
      )}
      <TextLink title={t('auth.backToSignIn')} onPress={() => navigation.navigate('SignIn')} />
    </AuthLayout>
  );
}
