import { useState } from 'react';
import { normalizePhone } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, ErrorText, Field, T } from '../../components/ui';
import AuthLayout from './AuthLayout';
import { TextLink } from './SignInScreen';

export default function SignUpScreen({ navigation }) {
  const { signIn } = useAuth();
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
        title="Check your email"
        sub={`We sent a verification link to ${f.email.trim()}. Open it, then sign in.`}
      >
        {done.devVerifyToken ? (
          <Button title="Verify email now" onPress={verifyNow} style={{ marginBottom: 10 }} />
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button
          title="Back to sign in"
          variant="secondary"
          onPress={() => navigation.navigate('SignIn')}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      sub="Broadcast one voice message to thousands of people."
    >
      <Field
        label="Organisation name"
        value={f.orgName}
        onChangeText={set('orgName')}
        placeholder="e.g. Hope Community Church"
      />
      <Field label="Your name" value={f.name} onChangeText={set('name')} autoComplete="name" />
      <Field
        label="Email"
        value={f.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label="Phone"
        value={f.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        placeholder="0712 345 678"
        error={phoneOk ? null : 'Enter a valid phone number'}
      />
      <Field
        label="Password (at least 8 characters)"
        value={f.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Create account"
        onPress={submit}
        loading={busy}
        disabled={!valid}
        style={{ marginTop: 14 }}
      />
      <T tone="muted" style={{ fontSize: 13, marginTop: 10 }}>
        By creating an account you agree to call only people who consented to receive calls from
        you.
      </T>
      <TextLink title="I already have an account" onPress={() => navigation.navigate('SignIn')} />
    </AuthLayout>
  );
}
