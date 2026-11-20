import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { CAMPAIGN_STATUS_LABELS } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useLiveCampaign } from '../../utils/useLiveCampaign';
import {
  Button,
  Card,
  ErrorText,
  H2,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Stat,
  StatGrid,
  T,
  Tag,
  statusTone,
} from '../../components/ui';
import { useTheme } from '../../theme';

const CALL_LABEL = {
  queued: ['Queued', 'muted'],
  ringing: ['Calling…', 'primary'],
  answered: ['Answered', 'success'],
  played: ['Message played', 'success'],
  unanswered: ['Unanswered', 'warning'],
  busy: ['Busy', 'warning'],
  failed: ['Failed', 'danger'],
  suppressed: ['Opted out – skipped', 'muted'],
  cancelled: ['Cancelled', 'muted'],
};

export default function CampaignLiveScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors } = useTheme();
  const { campaign: c, setCampaign, error, live } = useLiveCampaign(id);
  const [calls, setCalls] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const lastProcessed = useRef(-1);

  const loadCalls = useCallback(async () => {
    try {
      const r = await api(`/campaigns/${id}/calls`);
      setCalls(r);
    } catch {
      /* the summary above is what matters; ignore */
    }
  }, [id]);

  // Refresh the per-call list at most every 3 s while progress changes.
  useEffect(() => {
    if (!c || c.processed === lastProcessed.current) return undefined;
    const t = setTimeout(
      () => {
        lastProcessed.current = c.processed;
        loadCalls();
      },
      lastProcessed.current < 0 ? 0 : 3000,
    );
    return () => clearTimeout(t);
  }, [c, loadCalls]);

  async function act(action) {
    setBusy(action);
    setActionError(null);
    try {
      const r = await api(`/campaigns/${id}/${action}`, { method: 'POST' });
      setCampaign(r.campaign);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel this campaign?',
      'Calls not yet placed will not be made. Reserved credits are returned.',
      [
        { text: 'Keep running', style: 'cancel' },
        { text: 'Cancel campaign', style: 'destructive', onPress: () => act('cancel') },
      ],
    );
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
          dialogTitle: 'Export call results',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Saved', `CSV saved to ${file.uri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!c) {
    return (
      <Screen title="Campaign" back>
        {error ? <ErrorText>{error}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const progress = c.recipients ? c.processed / c.recipients : 0;
  const active = ['running', 'paused', 'scheduled', 'pending_approval'].includes(c.status);

  return (
    <Screen
      title={c.name}
      sub="Answered is shown separately from message played."
      back
      testID="campaign-live"
    >
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T
            bold
            tone={statusTone(c.status)}
            accessibilityLiveRegion="polite"
            testID="campaign-status"
          >
            {CAMPAIGN_STATUS_LABELS[c.status] || c.status.toUpperCase()}
          </T>
          <T tone="muted" style={{ fontSize: 12 }}>
            {live ? '● Live' : 'Updating every 3 s'}
          </T>
        </Row>
        <T style={{ marginVertical: 8 }} testID="campaign-processed">
          {c.processed.toLocaleString()} of {c.recipients.toLocaleString()} processed
        </T>
        <ProgressBar value={progress} />
        {c.status === 'pending_approval' ? (
          <T tone="warning" style={{ marginTop: 10 }}>
            Waiting for admin approval. No calls are made until it is approved.
          </T>
        ) : null}
        {c.status === 'scheduled' && c.scheduledAt ? (
          <T style={{ marginTop: 10 }}>Starts {new Date(c.scheduledAt).toLocaleString()}</T>
        ) : null}
        {c.status === 'rejected' ? (
          <T tone="danger" style={{ marginTop: 10 }}>
            Rejected: {c.rejectedReason}
          </T>
        ) : null}

        <View style={{ marginTop: 14 }}>
          <StatGrid>
            <Stat value={c.answered} label="Answered" tone="success" />
            <Stat value={c.played} label="Message played" />
            <Stat value={c.unanswered} label="Unanswered" tone="warning" />
            <Stat value={c.busy} label="Busy" />
            <Stat value={c.failed} label="Failed" tone="danger" />
            <Stat value={c.creditsUsed} label="Credits used" />
          </StatGrid>
        </View>
        {c.skipped || c.optOuts ? (
          <T tone="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {c.skipped} skipped (opted out) · {c.optOuts} pressed 9 to opt out
          </T>
        ) : null}
        <ErrorText>{actionError}</ErrorText>
        <Row>
          {c.status === 'running' || c.status === 'scheduled' ? (
            <Button
              title="Pause"
              variant="secondary"
              onPress={() => act('pause')}
              loading={busy === 'pause'}
            />
          ) : null}
          {c.status === 'paused' ? (
            <Button title="Resume" onPress={() => act('resume')} loading={busy === 'resume'} />
          ) : null}
          {active ? (
            <Button
              title="Cancel"
              variant="danger"
              onPress={confirmCancel}
              loading={busy === 'cancel'}
            />
          ) : (
            <Button title="New campaign" onPress={() => navigation.replace('CampaignWizard')} />
          )}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <H2 style={{ marginBottom: 0 }}>Call results</H2>
          <Button
            title="Export CSV"
            variant="secondary"
            icon="download-outline"
            onPress={exportCsv}
            loading={busy === 'csv'}
          />
        </Row>
        {!calls ? <Loading /> : null}
        {calls?.items.map((a) => {
          const [label, tone] = CALL_LABEL[a.status] || [a.status, 'text'];
          return (
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
                  {a.attemptNo > 1 ? ' · retry' : ''}
                  {a.durationSec ? ` · ${a.durationSec}s` : ''}
                  {a.dtmf === '9' ? ' · pressed 9' : ''}
                </T>
              </View>
              <Tag label={label} tone={tone} />
            </View>
          );
        })}
        {calls && calls.total > calls.items.length ? (
          <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Showing the latest {calls.items.length} of {calls.total.toLocaleString()} calls. Export
            CSV for all results.
          </T>
        ) : null}
      </Card>
    </Screen>
  );
}
