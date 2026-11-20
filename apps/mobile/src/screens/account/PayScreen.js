// Pay with M-Pesa STK Push. The app never decides that a payment succeeded:
// it only polls the server, which activates the plan from the verified
// Safaricom callback (or the server-side mock callback in mock mode).
import { useEffect, useRef, useState } from 'react';
import { goTo } from '../../utils/goTo';
import { ActivityIndicator, View } from 'react-native';
import { formatKes, isKenyanMobile } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, ErrorText, Field, H2, Row, Screen, T } from '../../components/ui';
import { useTheme } from '../../theme';

const POLL_MS = 3000;
const TIMEOUT_MS = 2 * 60_000;

export default function PayScreen({ route, navigation }) {
  const plan = route.params?.plan;
  const { colors } = useTheme();
  const { user, appConfig } = useAuth();
  const [phone, setPhone] = useState(user?.phone ? user.phone.replace(/^\+254/, '0') : '');
  const [payment, setPayment] = useState(null);
  const [phase, setPhase] = useState('form'); // form | waiting | succeeded | failed | timeout
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(0);

  const phoneValid = isKenyanMobile(phone);

  useEffect(() => {
    if (phase !== 'waiting' || !payment) return undefined;
    const t = setInterval(async () => {
      if (Date.now() - started.current > TIMEOUT_MS) {
        setPhase('timeout');
        return;
      }
      try {
        const r = await api(`/payments/${payment.id}`);
        setPayment(r.payment);
        if (r.payment.status !== 'pending') setPhase(r.payment.status);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, payment]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/payments/stk-push', {
        method: 'POST',
        body: { planId: plan.id, phone },
      });
      setPayment(r.payment);
      started.current = Date.now();
      setPhase('waiting');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function mock(action) {
    setBusy(true);
    try {
      await api(`/mock/mpesa/${payment.id}/${action}`, { method: 'POST' });
      const r = await api(`/payments/${payment.id}`);
      setPayment(r.payment);
      setPhase(r.payment.status === 'pending' ? 'waiting' : r.payment.status);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <Screen title="Payments" back>
        <Card>
          <T>No plan selected.</T>
          <Button
            title="Choose a plan"
            onPress={() => goTo(navigation, 'Subscription')}
            style={{ marginTop: 10 }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Payments"
      sub="Pay with M-Pesa (Lipa Na M-Pesa Online)."
      back
      testID="pay-screen"
    >
      <Card>
        <H2>
          {plan.name} plan · {formatKes(plan.priceKes)}
        </H2>
        <T tone="muted" style={{ fontSize: 14 }}>
          {plan.credits.toLocaleString()} credits · valid {plan.days} days
        </T>

        {phase === 'form' ? (
          <>
            <Field
              label="M-Pesa phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0712 345 678"
              autoComplete="tel"
              error={phone && !phoneValid ? 'Enter a Safaricom number like 0712 345 678' : null}
              testID="mpesa-phone"
            />
            <ErrorText>{error}</ErrorText>
            <Button
              title={`PAY ${formatKes(plan.priceKes)}`}
              variant="accent"
              onPress={pay}
              disabled={!phoneValid}
              loading={busy}
              style={{ marginTop: 14 }}
              testID="pay-button"
            />
            <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You will get a prompt on your phone to enter your M-Pesa PIN.
            </T>
          </>
        ) : null}

        {phase === 'waiting' ? (
          <View testID="check-phone" style={{ marginTop: 14 }}>
            <H2>Check your phone</H2>
            <T>
              Enter your M-Pesa PIN on {payment?.phone} to pay {formatKes(plan.priceKes)}. Your plan
              activates as soon as Safaricom confirms the payment.
            </T>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 }}
            >
              <ActivityIndicator color={colors.primary} />
              <T tone="muted">Waiting for M-Pesa confirmation…</T>
            </View>
            {appConfig?.mockPayments ? (
              <Row>
                <Button
                  title="Complete test payment"
                  onPress={() => mock('complete')}
                  disabled={busy}
                  testID="mock-pin"
                />
                <Button
                  title="Cancel test payment"
                  variant="secondary"
                  onPress={() => mock('cancel')}
                  disabled={busy}
                  testID="mock-cancel"
                />
              </Row>
            ) : null}
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        {phase === 'succeeded' ? (
          <View style={{ marginTop: 14 }} testID="pay-success">
            <H2 style={{ color: colors.success }}>Payment received</H2>
            <T>
              M-Pesa receipt {payment?.mpesaReceipt}. Your {plan.name} plan is active and{' '}
              {plan.credits.toLocaleString()} credits were added.
            </T>
            <Button
              title="Back to subscription"
              onPress={() => goTo(navigation, 'Subscription')}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : null}

        {phase === 'failed' || phase === 'timeout' ? (
          <View style={{ marginTop: 14 }} testID="pay-failed">
            <H2 style={{ color: phase === 'failed' ? colors.danger : colors.warning }}>
              {phase === 'failed' ? 'Payment not completed' : 'Still waiting for M-Pesa'}
            </H2>
            <T>
              {phase === 'failed'
                ? payment?.resultDesc ||
                  'The payment was cancelled or failed. You were not charged.'
                : 'We have not heard back from M-Pesa yet. If you entered your PIN, your plan will activate automatically — check Payments shortly.'}
            </T>
            <Row style={{ marginTop: 12 }}>
              <Button
                title="Try again"
                onPress={() => {
                  setPhase('form');
                  setPayment(null);
                }}
              />
              <Button
                title="Payment history"
                variant="secondary"
                onPress={() => goTo(navigation, 'Payments')}
              />
            </Row>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
