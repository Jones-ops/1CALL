import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { APPROVAL_CATEGORIES, CAMPAIGN_CATEGORIES } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useApiData } from '../../utils/useApiData';
import { useI18n } from '../../i18n';
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
import { MIN_TOUCH, radius, useTheme } from '../../theme';
import { haptic } from '../../utils/haptics';

const n = (v) => Number(v ?? 0).toLocaleString('en-US');

function defaultSchedule() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return d;
}

/** Visual summary of who will be called. */
function RecipientCard({ est }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View
      testID="recipient-summary"
      accessible
      accessibilityLabel={t('wizard.recipientsA11y', {
        total: est.total,
        skipped: est.optedOut,
        called: est.recipients,
      })}
      style={{
        marginTop: 14,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <View style={{ alignItems: 'center', minWidth: 84 }}>
        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.success }}>
          {n(est.recipients)}
        </Text>
        <T tone="muted" style={{ fontSize: 13 }}>
          {t('wizard.willBeCalled')}
        </T>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T style={{ fontSize: 14 }}>{t('wizard.inGroup', { n: n(est.total) })}</T>
        <T tone={est.optedOut ? 'warning' : 'muted'} style={{ fontSize: 14 }}>
          {t('wizard.skipped', { n: n(est.optedOut) })}
        </T>
      </View>
    </View>
  );
}

export default function CampaignWizardScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const STEPS = [t('wizard.s1'), t('wizard.s2'), t('wizard.s3'), t('wizard.s4')];
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
      haptic.success();
      navigation.replace('CampaignLive', { id: r.campaign.id });
    } catch (e) {
      setLaunchError(errorMessage(e));
    } finally {
      setLaunching(false);
    }
  }

  // Back / Next (or START on the last step) stay pinned to the bottom.
  const footer = (
    <>
      {step > 1 ? (
        <Button title={t('common.back')} variant="secondary" onPress={() => setStep(step - 1)} />
      ) : null}
      {step < 4 ? (
        <Button
          title={t('common.next')}
          icon="arrow-forward"
          onPress={() => setStep(step + 1)}
          disabled={!canNext}
          style={{ flex: 1 }}
          testID="wizard-next"
        />
      ) : (
        <Button
          title={t('wizard.start')}
          variant="accent"
          disabled={!canLaunch}
          onPress={() => setConfirmOpen(true)}
          style={{ flex: 1 }}
          testID="wizard-start"
        />
      )}
    </>
  );

  return (
    <Screen title={t('wizard.title')} back footer={footer} testID="wizard">
      <Steps steps={STEPS} current={step} />
      <Card>
        {step === 1 ? (
          <View testID="step-recipients">
            <Select
              label={t('wizard.group')}
              value={groupId}
              onChange={setGroupId}
              placeholder={t('wizard.groupPh')}
              options={(groups.data?.items ?? []).map((g) => ({
                value: g.id,
                label: `${g.name} (${g.count})`,
              }))}
              testID="wizard-group"
            />
            {groups.data?.items.length === 0 ? (
              <T tone="muted" style={{ marginTop: 8 }}>
                {t('wizard.noGroups')}
              </T>
            ) : null}
            <ErrorText>{estError}</ErrorText>
            {groupId && est ? <RecipientCard est={est} /> : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Select
              label={t('wizard.recording')}
              value={recordingId}
              onChange={setRecordingId}
              placeholder={t('wizard.recordingPh')}
              options={(recordings.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))}
              testID="wizard-recording"
            />
            {recording ? (
              <View style={{ marginTop: 10 }}>
                <AudioPlayer recordingId={recording.id} label={t('wizard.preview')} />
              </View>
            ) : null}
            <Pressable
              onPress={() => navigation.navigate('Record')}
              accessibilityRole="link"
              style={{ minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: 8 }}
            >
              <T tone="muted">
                {t('wizard.noRecording')}{' '}
                <T style={{ color: colors.primary, fontWeight: '600' }}>{t('wizard.recordLink')}</T>
              </T>
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Field
              label={t('wizard.name')}
              value={name}
              onChangeText={setName}
              placeholder={t('wizard.namePh')}
              testID="wizard-name"
            />
            <Select
              label={t('wizard.type')}
              value={category}
              onChange={setCategory}
              options={CAMPAIGN_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
              testID="wizard-category"
            />
            {needsApproval ? (
              <T tone="warning" style={{ marginTop: 8 }} testID="approval-warning">
                {t('wizard.approvalWarning')}
              </T>
            ) : null}
            <Select
              label={t('wizard.when')}
              value={when}
              onChange={setWhen}
              options={[
                { value: 'now', label: t('wizard.now') },
                { value: 'later', label: t('wizard.later') },
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
            <Checkbox checked={optOut} onChange={setOptOut} label={t('wizard.optOut')} />
            <T tone="muted" style={{ fontSize: 14 }}>
              {t('wizard.hours')}
            </T>
          </View>
        ) : null}

        {step === 4 ? (
          <View testID="step-review">
            <KV
              rows={[
                [t('wizard.rvCampaign'), name.trim() || '—'],
                [t('wizard.rvRecording'), recording?.name || '—'],
                [t('wizard.rvRecipients'), n(recipients)],
                [t('wizard.rvCredits'), n(est?.estimatedCredits)],
                [
                  t('wizard.rvAvailable'),
                  n(est?.available),
                  est?.sufficient ? 'success' : 'danger',
                ],
                [
                  t('wizard.rvStarts'),
                  when === 'later'
                    ? scheduledAt.toLocaleString()
                    : needsApproval
                      ? t('wizard.afterApproval')
                      : t('wizard.immediately'),
                ],
                [
                  t('wizard.rvRestrictions'),
                  t(optOut ? 'wizard.restrictionsOn' : 'wizard.restrictionsOff'),
                ],
              ]}
            />
            <T tone="muted" style={{ marginTop: 12, fontSize: 14 }}>
              {t('wizard.billingNote')}
            </T>
            {!est?.subscriptionActive ? <ErrorText>{t('wizard.errNoPlan')}</ErrorText> : null}
            {est?.overPlanLimit ? (
              <ErrorText>
                {t('wizard.errPlanLimit', { plan: est.planName, n: n(est.maxRecipients) })}
              </ErrorText>
            ) : null}
            {est && !est.sufficient ? <ErrorText>{t('wizard.errCredits')}</ErrorText> : null}
          </View>
        ) : null}
      </Card>

      <Sheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('wizard.confirmTitle')}
      >
        <T bold>{name.trim()}</T>
        <T style={{ marginBottom: 6 }}>
          {t('wizard.confirmSummary', {
            n: n(recipients),
            rec: recording?.name ?? '',
            credits: n(est?.estimatedCredits),
            available: n(est?.available),
          })}
        </T>
        <Checkbox
          checked={decl1}
          onChange={setDecl1}
          testID="decl-consent"
          label={t('wizard.decl1')}
        />
        <Checkbox
          checked={decl2}
          onChange={setDecl2}
          testID="decl-lawful"
          label={t('wizard.decl2')}
        />
        <ErrorText>{launchError}</ErrorText>
        <Row style={{ marginTop: 10 }}>
          <Button
            title={t('common.cancel')}
            variant="secondary"
            onPress={() => setConfirmOpen(false)}
          />
          <Button
            title={t('wizard.start')}
            variant="accent"
            disabled={!decl1 || !decl2}
            loading={launching}
            onPress={launch}
            style={{ flexGrow: 1 }}
            testID="confirm-launch"
          />
        </Row>
        {needsApproval ? <Label>{t('wizard.waitApproval')}</Label> : null}
      </Sheet>
    </Screen>
  );
}
