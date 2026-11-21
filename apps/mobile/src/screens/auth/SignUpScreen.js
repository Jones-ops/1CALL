import { useState } from 'react';
import { normalizePhone } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Button, ErrorText, Field, T } from '../../components/ui';
import AuthLayout from './AuthLayout';
import { TextLink } from './SignInScreen';

export default function SignUpScreen({ navigation }) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [f, setF] = useState({ orgName: '', name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const phoneOk = !f.phone || !!normalizePhone(f.phone);
  const valid =
    f.orgName.trim().length >= 2 &&
    f.name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(f.email) &&
    f.phone &&
    phoneOk &&
    f.password.length >= 8;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/register', {
        method: 'POST',
        body: { ...f, email: f.email.trim() },
        auth: false,
      });
      if (r.verificationRequired === false) {
        await signIn(f.email.trim(), f.password);
        return;
      }
      setDone(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyNow() {
    try {
      await api('/auth/verify-email', {
        method: 'POST',
        body: { token: done.devVerifyToken },
        auth: false,
      });
      navigation.navigate('SignIn');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (done) {
    return (
      <AuthLayout
        title={t('auth.checkEmail')}
        sub={t('auth.checkEmailSub', { email: f.email.trim() })}
      >
        {done.devVerifyToken ? (
          <Button title={t('auth.verifyNow')} onPress={verifyNow} style={{ marginBottom: 10 }} />
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button
          title={t('auth.backToSignIn')}
          variant="secondary"
          onPress={() => navigation.navigate('SignIn')}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.createTitle')} sub={t('auth.createSub')}>
      <Field
        label={t('auth.orgName')}
        value={f.orgName}
        onChangeText={set('orgName')}
        placeholder={t('auth.orgNamePh')}
      />
      <Field
        label={t('auth.yourName')}
        value={f.name}
        onChangeText={set('name')}
        autoComplete="name"
      />
      <Field
        label={t('auth.email')}
        value={f.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label={t('auth.phone')}
        value={f.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        placeholder="0712 345 678"
        error={phoneOk ? null : t('auth.phoneError')}
      />
      <Field
        label={t('auth.passwordNew')}
        value={f.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title={t('auth.createButton')}
        onPress={submit}
        loading={busy}
        disabled={!valid}
        style={{ marginTop: 14 }}
      />
      <T tone="muted" style={{ fontSize: 13, marginTop: 10 }}>
        {t('auth.consentNote')}
      </T>
      <TextLink title={t('auth.haveAccount')} onPress={() => navigation.navigate('SignIn')} />
    </AuthLayout>
  );
}
