import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { APPROVAL_CATEGORIES, CAMPAIGN_CATEGORIES } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useApiData } from '../../utils/useApiData';
import AudioPlayer from '../../components/AudioPlayer';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Field,
  KV,
  Label,
  Row,
  Screen,
  Select,
  Sheet,
  Steps,
  T,
} from '../../components/ui';
import { useTheme, MIN_TOUCH } from '../../theme';

const STEPS = ['Recipients', 'Message', 'Details', 'Review'];
const n = (v) => Number(v ?? 0).toLocaleString('en-US');

function defaultSchedule() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return d;
}

export default function CampaignWizardScreen({ navigation, route }) {
  const { colors } = useTheme();
  const groups = useApiData('/groups');
  const recordings = useApiData('/recordings');
  const [step, setStep] = useState(1);
  const [groupId, setGroupId] = useState(route?.params?.groupId ?? '');
  const [recordingId, setRecordingId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('informational');
  const [when, setWhen] = useState('now');
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [optOut, setOptOut] = useState(true);
  const [est, setEst] = useState(null);
  const [estError, setEstError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [decl1, setDecl1] = useState(false);
  const [decl2, setDecl2] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);

  useEffect(() => {
    if (!groupId) {
      setEst(null);
      return;
    }
    let live = true;
    api('/campaigns/estimate', {
      method: 'POST',
      body: { groupId, recordingId: recordingId || undefined },
    })
      .then((r) => live && (setEst(r), setEstError(null)))
      .catch((e) => live && setEstError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [groupId, recordingId]);

  const recording = recordings.data?.items.find((r) => r.id === recordingId);
  const needsApproval = APPROVAL_CATEGORIES.includes(category);
  const recipients = est?.recipients ?? 0;
  const canNext =
    step === 1
      ? recipients > 0
      : step === 2
        ? !!recordingId
        : step === 3
          ? name.trim().length >= 2
          : true;
  const canLaunch =
    recipients > 0 &&
    !!recording &&
    !!est?.sufficient &&
    name.trim().length >= 2 &&
    est?.subscriptionActive &&
    !est?.overPlanLimit;

  function pickSchedule() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: scheduledAt,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (e, date) => {
          if (e.type !== 'set' || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (e2, time) => e2.type === 'set' && time && setScheduledAt(time),
          });
        },
      });
    }
  }

  async function launch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const r = await api('/campaigns', {
        method: 'POST',
        body: {
          name: name.trim(),
          groupId,
          recordingId,
          category,
          scheduledAt: when === 'later' ? scheduledAt.toISOString() : null,
          optOutEnabled: optOut,
          declarations: { consent: decl1, lawful: decl2 },
        },
      });
      setConfirmOpen(false);
      navigation.replace('CampaignLive', { id: r.campaign.id });
    } catch (e) {
      setLaunchError(errorMessage(e));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Screen title="Voice Campaigns" sub="Set up a broadcast in four steps." back testID="wizard">
      <Steps steps={STEPS} current={step} />
      <Card>
        {step === 1 ? (
          <View testID="step-recipients">
            <Select
              label="Contact group"
              value={groupId}
              onChange={setGroupId}
              placeholder="Select a group"
              options={(groups.data?.items ?? []).map((g) => ({
                value: g.id,
                label: `${g.name} (${g.count})`,
              }))}
              testID="wizard-group"
            />
            {groups.data?.items.length === 0 ? (
              <T tone="muted" style={{ marginTop: 8 }}>
                You have no contacts yet. Import some on the Contacts tab.
              </T>
            ) : null}
            <ErrorText>{estError}</ErrorText>
            {groupId && est ? (
              <T style={{ marginTop: 12 }} testID="recipient-summary">
                {n(est.total)} contacts ·{' '}
                <T tone="warning">{n(est.optedOut)} opted out and will be skipped</T> ·{' '}
                <T bold>{n(est.recipients)}</T> will be called
              </T>
            ) : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Select
              label="Voice recording"
              value={recordingId}
              onChange={setRecordingId}
              placeholder="Select a recording"
              options={(recordings.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))}
              testID="wizard-recording"
            />
            {recording ? (
              <View style={{ marginTop: 10 }}>
                <AudioPlayer recordingId={recording.id} label="Preview" />
              </View>
            ) : null}
            <Pressable
              onPress={() => navigation.navigate('Record')}
              accessibilityRole="link"
              style={{ minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: 8 }}
            >
              <T tone="muted">
                No recording yet? Use{' '}
                <T style={{ color: colors.primary, fontWeight: '600' }}>Record Voice</T>.
              </T>
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Field
              label="Campaign name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. December announcement"
              testID="wizard-name"
            />
            <Select
              label="Type of campaign"
              value={category}
              onChange={setCategory}
              options={CAMPAIGN_CATEGORIES.map((c) => ({ value: c, label: c }))}
              testID="wizard-category"
            />
            {needsApproval ? (
              <T tone="warning" style={{ marginTop: 8 }} testID="approval-warning">
                Promotional and political campaigns need account verification and admin approval
                before any calls are made.
              </T>
            ) : null}
            <Select
              label="When"
              value={when}
              onChange={setWhen}
              options={[
                { value: 'now', label: 'Start immediately' },
                { value: 'later', label: 'Schedule for later' },
              ]}
            />
            {when === 'later' ? (
              Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={scheduledAt}
                  mode="datetime"
                  minimumDate={new Date()}
                  onChange={(_e, d) => d && setScheduledAt(d)}
                  style={{ marginTop: 8 }}
                />
              ) : (
                <Button
                  title={scheduledAt.toLocaleString()}
                  variant="secondary"
                  icon="calendar-outline"
                  onPress={pickSchedule}
                  style={{ marginTop: 8 }}
                />
              )
            ) : null}
            <Checkbox
              checked={optOut}
              onChange={setOptOut}
              label="Offer “press 9 to stop receiving calls” after the message"
            />
            <T tone="muted" style={{ fontSize: 14 }}>
              Calls are placed between 08:00 and 19:00 East Africa Time. Unanswered calls are
              retried once.
            </T>
          </View>
        ) : null}

        {step === 4 ? (
          <View testID="step-review">
            <KV
              rows={[
                ['Campaign', name.trim() || 'Untitled'],
                ['Recording', recording?.name || '—'],
                ['Recipients', n(recipients)],
                ['Estimated credits (maximum)', n(est?.estimatedCredits)],
                ['Available credits', n(est?.available), est?.sufficient ? 'success' : 'danger'],
                [
                  'Starts',
                  when === 'later'
                    ? scheduledAt.toLocaleString()
                    : needsApproval
                      ? 'After admin approval'
                      : 'Immediately',
                ],
                ['Restrictions', `Opt-out ${optOut ? 'on' : 'off'} · 08:00–19:00 · max 2 attempts`],
              ]}
            />
            <T tone="muted" style={{ marginVertical: 12, fontSize: 14 }}>
              1 credit is charged per answered call of up to 30 seconds. Unanswered, busy and failed
              calls are not charged.
            </T>
            {!est?.subscriptionActive ? (
              <ErrorText>
                You need an active plan. Choose one under Account › Subscription.
              </ErrorText>
            ) : null}
            {est?.overPlanLimit ? (
              <ErrorText>{`Your ${est.planName} plan allows up to ${n(est.maxRecipients)} recipients per campaign.`}</ErrorText>
            ) : null}
            {est && !est.sufficient ? (
              <ErrorText>
                Not enough credits for this campaign. Top up under Account › Subscription.
              </ErrorText>
            ) : null}
            {!name.trim() ? <ErrorText>Give the campaign a name.</ErrorText> : null}
            <Button
              title="START VOICE BROADCAST"
              variant="accent"
              big
              disabled={!canLaunch}
              onPress={() => setConfirmOpen(true)}
              testID="wizard-start"
            />
          </View>
        ) : null}

        <Row style={{ marginTop: 14 }}>
          {step > 1 ? (
            <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} />
          ) : null}
          {step < 4 ? (
            <Button
              title="Next"
              onPress={() => setStep(step + 1)}
              disabled={!canNext}
              testID="wizard-next"
            />
          ) : null}
        </Row>
      </Card>

      <Sheet visible={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm broadcast">
        <T bold>{name.trim()}</T>
        <T style={{ marginBottom: 6 }}>
          {n(recipients)} recipients · message “{recording?.name}”{'\n'}Up to{' '}
          {n(est?.estimatedCredits)} credits (you have {n(est?.available)})
        </T>
        <Checkbox
          checked={decl1}
          onChange={setDecl1}
          testID="decl-consent"
          label="These contacts agreed to receive these calls and I have the right to contact them."
        />
        <Checkbox
          checked={decl2}
          onChange={setDecl2}
          testID="decl-lawful"
          label="My message names who is calling and is lawful, truthful and not harassing."
        />
        <ErrorText>{launchError}</ErrorText>
        <Row style={{ marginTop: 10 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setConfirmOpen(false)} />
          <Button
            title="START VOICE BROADCAST"
            variant="accent"
            disabled={!decl1 || !decl2}
            loading={launching}
            onPress={launch}
            style={{ flexGrow: 1 }}
            testID="confirm-launch"
          />
        </Row>
        <Label>
          {needsApproval ? 'This campaign will wait for admin approval before calling.' : ''}
        </Label>
      </Sheet>
    </Screen>
  );
}
