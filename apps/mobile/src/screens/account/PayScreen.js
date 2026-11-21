// Pay with M-Pesa STK Push. The app never decides that a payment succeeded:
// it only polls the server, which activates the plan from the verified
// Safaricom callback (or the server-side test callback while M-Pesa is not live).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatKes, isKenyanMobile } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { goTo } from '../../utils/goTo';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import { Button, Card, ErrorText, Field, H2, Row, Screen, T } from '../../components/ui';
import { useTheme } from '../../theme';

const POLL_MS = 3000;
const TIMEOUT_MS = 2 * 60_000;

export default function PayScreen({ route, navigation }) {
  const plan = route.params?.plan;
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
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
    const tm = setInterval(async () => {
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
    return () => clearInterval(tm);
  }, [phase, payment]);

  // Toast once the server confirms.
  useEffect(() => {
    if (phase === 'succeeded') toast.show(t('pay.toastPaid', { plan: plan?.name }));
    if (phase === 'failed') toast.show(t('pay.toastFailed'), 'danger');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
      <Screen title={t('pay.title')} back>
        <Card>
          <T>{t('pay.noPlan')}</T>
          <Button
            title={t('pay.choosePlan')}
            onPress={() => goTo(navigation, 'Subscription')}
            style={{ marginTop: 10 }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={t('pay.title')} sub={t('pay.sub')} back testID="pay-screen">
      <Card>
        <H2>
          {plan.name} · {formatKes(plan.priceKes)}
        </H2>
        <T tone="muted" style={{ fontSize: 14 }}>
          {t('pay.planDetails', { credits: plan.credits.toLocaleString(), days: plan.days })}
        </T>

        {phase === 'form' ? (
          <>
            <Field
              label={t('pay.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0712 345 678"
              autoComplete="tel"
              error={phone && !phoneValid ? t('pay.phoneError') : null}
              testID="mpesa-phone"
            />
            <ErrorText>{error}</ErrorText>
            <Button
              title={t('pay.payButton', { amount: formatKes(plan.priceKes) })}
              variant="accent"
              onPress={pay}
              disabled={!phoneValid}
              loading={busy}
              style={{ marginTop: 14 }}
              testID="pay-button"
            />
            <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {t('pay.pinHint')}
            </T>
          </>
        ) : null}

        {phase === 'waiting' ? (
          <View testID="check-phone" style={{ marginTop: 14 }}>
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="phone-portrait-outline" size={44} color={colors.primary} />
            </View>
            <H2 style={{ textAlign: 'center' }}>{t('pay.checkPhone')}</H2>
            <T style={{ textAlign: 'center' }}>
              {t('pay.enterPin', { phone: payment?.phone, amount: formatKes(plan.priceKes) })}
            </T>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginVertical: 14,
              }}
            >
              <ActivityIndicator color={colors.primary} />
              <T tone="muted">{t('pay.waiting')}</T>
            </View>
            {appConfig?.mockPayments ? (
              <Row style={{ justifyContent: 'center' }}>
                <Button
                  title={t('pay.testComplete')}
                  onPress={() => mock('complete')}
                  disabled={busy}
                  testID="mock-pin"
                />
                <Button
                  title={t('pay.testCancel')}
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
          <View style={{ marginTop: 14, alignItems: 'center' }} testID="pay-success">
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <H2 style={{ color: colors.success, marginTop: 6 }}>{t('pay.received')}</H2>
            <T style={{ textAlign: 'center' }}>
              {t('pay.receivedText', {
                receipt: payment?.mpesaReceipt,
                plan: plan.name,
                credits: plan.credits.toLocaleString(),
              })}
            </T>
            <Button
              title={t('pay.backToSub')}
              onPress={() => goTo(navigation, 'Subscription')}
              style={{ marginTop: 14, alignSelf: 'stretch' }}
            />
          </View>
        ) : null}

        {phase === 'failed' || phase === 'timeout' ? (
          <View style={{ marginTop: 14 }} testID="pay-failed">
            <H2 style={{ color: phase === 'failed' ? colors.danger : colors.warning }}>
              {phase === 'failed' ? t('pay.notCompleted') : t('pay.stillWaiting')}
            </H2>
            <T>
              {phase === 'failed'
                ? payment?.resultDesc || t('pay.failedText')
                : t('pay.timeoutText')}
            </T>
            <Row style={{ marginTop: 12 }}>
              <Button
                title={t('pay.tryAgain')}
                onPress={() => {
                  setPhase('form');
                  setPayment(null);
                }}
              />
              <Button
                title={t('pay.history')}
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
