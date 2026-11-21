import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, errorMessage } from '../../api/client';
import { useLiveCampaign } from '../../utils/useLiveCampaign';
import { formatTime, useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import RingChart from '../../components/RingChart';
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorText,
  H2,
  ProgressBar,
  Row,
  Screen,
  Skeleton,
  SkeletonCard,
  T,
  Tag,
  statusTone,
} from '../../components/ui';
import { useTheme } from '../../theme';

const CALL_TONE = {
  queued: 'muted',
  ringing: 'primary',
  answered: 'success',
  played: 'success',
  unanswered: 'warning',
  busy: 'warning',
  failed: 'danger',
  suppressed: 'muted',
  cancelled: 'muted',
};
const ACTIVE = ['running', 'paused', 'scheduled', 'pending_approval'];

function LegendRow({ color, label, value }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color ? colors[color] : 'transparent',
          borderWidth: color ? 0 : 1,
          borderColor: colors.muted,
        }}
      />
      <T style={{ flex: 1, fontSize: 14 }}>{label}</T>
      <T bold style={{ fontSize: 15 }}>
        {value}
      </T>
    </View>
  );
}

export default function CampaignLiveScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { campaign: c, setCampaign, retry, error, live, reload } = useLiveCampaign(id);
  const [calls, setCalls] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const loadCalls = useCallback(async () => {
    try {
      setCalls(await api(`/campaigns/${id}/calls`));
    } catch {
      /* the summary above is what matters */
    }
  }, [id]);

  const active = c ? ACTIVE.includes(c.status) : false;
  // Per-call list + retry info refresh every 5 s while the campaign is active.
  useEffect(() => {
    loadCalls();
    if (!active) return undefined;
    const tm = setInterval(() => {
      loadCalls();
      reload();
    }, 5000);
    return () => clearInterval(tm);
  }, [active, loadCalls, reload]);

  async function act(action) {
    setBusy(action);
    setActionError(null);
    try {
      const r = await api(`/campaigns/${id}/${action}`, { method: 'POST' });
      setCampaign(r.campaign);
      toast.show(t(`live.done_${action}`));
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  }

  async function exportCsv() {
    setBusy('csv');
    try {
      const res = await api(`/campaigns/${id}/calls.csv`, { raw: true });
      const text = await res.text();
      const file = new File(
        Paths.cache,
        `${c.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'campaign'}-calls.csv`,
      );
      if (file.exists) file.delete();
      file.create();
      file.write(text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: t('live.exportTitle'),
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(t('live.saved'), file.uri);
      }
    } catch (e) {
      toast.show(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  }

  if (!c) {
    return (
      <Screen title={t('live.title')} back>
        {error ? <ErrorText>{error}</ErrorText> : <SkeletonCard lines={5} />}
      </Screen>
    );
  }

  const progress = c.recipients ? c.processed / c.recipients : 0;
  const pct = Math.round(progress * 100);

  return (
    <Screen title={c.name} sub={t('live.sub')} back testID="campaign-live">
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T
            bold
            tone={statusTone(c.status)}
            accessibilityLiveRegion="polite"
            testID="campaign-status"
          >
            {t(`status.${c.status}`)}
          </T>
          <T tone="muted" style={{ fontSize: 12 }}>
            {active ? (live ? t('live.live') : t('live.polling')) : ''}
          </T>
        </Row>
        <T style={{ marginVertical: 8 }} testID="campaign-processed">
          {t('live.processed', {
            done: c.processed.toLocaleString(),
            total: c.recipients.toLocaleString(),
          })}
        </T>
        <ProgressBar value={progress} />

        {retry?.waiting > 0 && active ? (
          <T tone="warning" style={{ marginTop: 10, fontSize: 14 }} testID="retry-info">
            {t('live.retryWaiting', {
              n: retry.waiting,
              time: formatTime(retry.nextAt, lang),
            })}
          </T>
        ) : null}
        {c.status === 'pending_approval' ? (
          <T tone="warning" style={{ marginTop: 10 }}>
            {t('live.pendingApproval')}
          </T>
        ) : null}
        {c.status === 'scheduled' && c.scheduledAt ? (
          <T style={{ marginTop: 10 }}>
            {t('live.startsAt', { time: new Date(c.scheduledAt).toLocaleString() })}
          </T>
        ) : null}
        {c.status === 'rejected' ? (
          <T tone="danger" style={{ marginTop: 10 }}>
            {t('live.rejected', { reason: c.rejectedReason })}
          </T>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <RingChart
            total={c.recipients}
            segments={[
              { value: c.played, color: colors.success },
              { value: c.answered - c.played, color: '#7fd3a8' },
              { value: c.unanswered + c.busy, color: colors.accent },
              { value: c.failed, color: colors.danger },
            ]}
            centerLabel={`${pct}%`}
            centerSub={t('live.done')}
          />
          <View style={{ flex: 1 }}>
            <LegendRow color="success" label={t('live.answered')} value={c.answered} />
            <LegendRow label={t('live.played')} value={c.played} />
            <LegendRow color="accent" label={t('live.unanswered')} value={c.unanswered} />
            <LegendRow color="accent" label={t('live.busy')} value={c.busy} />
            <LegendRow color="danger" label={t('live.failed')} value={c.failed} />
            <LegendRow label={t('live.credits')} value={c.creditsUsed} />
          </View>
        </View>
        {c.skipped || c.optOuts ? (
          <T tone="muted" style={{ fontSize: 13, marginTop: 10 }}>
            {t('live.optOuts', { skipped: c.skipped, opt: c.optOuts })}
          </T>
        ) : null}
        <ErrorText>{actionError}</ErrorText>
        <Row style={{ marginTop: 12 }}>
          {c.status === 'running' || c.status === 'scheduled' ? (
            <Button
              title={t('live.pause')}
              icon="pause"
              variant="secondary"
              onPress={() => act('pause')}
              loading={busy === 'pause'}
            />
          ) : null}
          {c.status === 'paused' ? (
            <Button
              title={t('live.resume')}
              icon="play"
              onPress={() => act('resume')}
              loading={busy === 'resume'}
            />
          ) : null}
          {active ? (
            <Button
              title={t('live.cancel')}
              variant="danger"
              onPress={() => setConfirmCancel(true)}
              loading={busy === 'cancel'}
            />
          ) : (
            <Button
              title={t('live.new')}
              icon="add"
              onPress={() => navigation.replace('CampaignWizard')}
            />
          )}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <H2 style={{ marginBottom: 0 }}>{t('live.results')}</H2>
          <Button
            title={t('live.export')}
            variant="secondary"
            icon="download-outline"
            onPress={exportCsv}
            loading={busy === 'csv'}
          />
        </Row>
        {!calls ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} width="55%" />
            <Skeleton height={14} width="65%" />
          </View>
        ) : null}
        {calls?.items.map((a) => (
          <View
            key={a.id}
            style={{
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <T numberOfLines={1}>{a.name || a.phone}</T>
              <T tone="muted" style={{ fontSize: 12 }}>
                {a.phone}
                {a.attemptNo > 1 ? ` · ${t('live.retry')}` : ''}
                {a.durationSec ? ` · ${a.durationSec}s` : ''}
                {a.dtmf === '9' ? ` · ${t('live.pressed9')}` : ''}
              </T>
            </View>
            <Tag label={t(`call.${a.status}`)} tone={CALL_TONE[a.status] || 'text'} />
          </View>
        ))}
        {calls && calls.total > calls.items.length ? (
          <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {t('live.showing', { shown: calls.items.length, total: calls.total.toLocaleString() })}
          </T>
        ) : null}
      </Card>

      <ConfirmSheet
        visible={confirmCancel}
        title={t('live.cancelTitle')}
        message={t('live.cancelMsg')}
        confirmLabel={t('live.cancelConfirm')}
        onConfirm={() => act('cancel')}
        onClose={() => setConfirmCancel(false)}
        busy={busy === 'cancel'}
      />
    </Screen>
  );
}
