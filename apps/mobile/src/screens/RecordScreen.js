import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { BILLING_UNIT_SECONDS, creditsPerCall, formatDuration } from '@1call/shared';
import { api, errorMessage } from '../api/client';
import { appendFile } from '../utils/filePart';
import { useApiData } from '../utils/useApiData';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import AudioPlayer from '../components/AudioPlayer';
import {
  ActionMenu,
  Button,
  Card,
  Checkbox,
  ConfirmSheet,
  EmptyState,
  ErrorText,
  Field,
  H2,
  IconButton,
  Row,
  Screen,
  SegmentedTabs,
  Skeleton,
  T,
} from '../components/ui';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';

const UPLOAD_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/*',
];
const METER_BARS = 28;

function PulsingDot() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => {});
    return () => loop?.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.danger,
        marginRight: 8,
        opacity,
      }}
    />
  );
}

/** Rolling sound-level bars so people can see the microphone hears them. */
function LevelMeter({ levels, active }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 44,
        marginBottom: 8,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {levels.map((l, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: Math.max(4, l * 44),
            borderRadius: 3,
            backgroundColor: active ? colors.accent : colors.border,
          }}
        />
      ))}
    </View>
  );
}

/** The big round record / stop button. */
function RoundButton({ icon, color, onPress, label, testID }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        })}
      >
        <Ionicons name={icon} size={38} color="#fff" />
      </Pressable>
      <T bold style={{ fontSize: 14 }}>
        {label}
      </T>
    </View>
  );
}

export default function RecordScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 150);
  const [tab, setTab] = useState('record');
  const [phase, setPhase] = useState('idle'); // idle | recording | paused | done
  const [clip, setClip] = useState(null); // { uri, name, webFile, durationSec }
  const [name, setName] = useState('');
  const [identifies, setIdentifies] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [levels, setLevels] = useState(() => Array(METER_BARS).fill(0));
  const [menuFor, setMenuFor] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { data, refresh, refreshing, reload } = useApiData('/recordings');

  // Metering is in dB (about -60 = silence, 0 = loudest); map to 0..1.
  useEffect(() => {
    if (phase !== 'recording') return;
    const db = typeof recState.metering === 'number' ? recState.metering : -60;
    const level = Math.max(0, Math.min(1, (db + 60) / 60));
    setLevels((prev) => [...prev.slice(1), level]);
  }, [recState.durationMillis, recState.metering, phase]);

  const elapsed =
    phase === 'done' ? (clip?.durationSec ?? 0) : (recState.durationMillis || 0) / 1000;
  const overLimit = elapsed > BILLING_UNIT_SECONDS;
  const nearLimit = elapsed >= BILLING_UNIT_SECONDS - 5;
  const timerColor = overLimit ? colors.accent : nearLimit ? colors.warning : colors.text;

  async function start() {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(t('rec.errPermission'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptic.press();
      setClip(null);
      setLevels(Array(METER_BARS).fill(0));
      setPhase('recording');
    } catch (e) {
      setError(t('rec.errStart', { msg: e.message }));
    }
  }

  function pause() {
    recorder.pause();
    setPhase('paused');
  }
  function resume() {
    recorder.record();
    setPhase('recording');
  }
  async function stop() {
    const durationSec = (recState.durationMillis || 0) / 1000;
    haptic.press();
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) {
      setError(t('rec.errSave'));
      setPhase('idle');
      return;
    }
    setClip({ uri: recorder.uri, name: 'recording.m4a', durationSec });
    setPhase('done');
  }

  function discard() {
    setClip(null);
    setPhase('idle');
    setName('');
    setIdentifies(false);
    setLevels(Array(METER_BARS).fill(0));
  }

  async function pickUpload() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({
      type: UPLOAD_TYPES,
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (!/\.(mp3|wav|m4a|aac|mp4)$/i.test(a.name)) {
      setError(t('rec.errType'));
      return;
    }
    setClip({ uri: a.uri, name: a.name, webFile: a.file, durationSec: null });
    setName(a.name.replace(/\.[^.]+$/, ''));
    setPhase('done');
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('identifiesCaller', 'true');
      await appendFile(form, 'file', { uri: clip.uri, name: clip.name, webFile: clip.webFile });
      const r = await api('/recordings', { method: 'POST', form });
      toast.show(
        r.warning ? t('rec.savedLong') : t('rec.saved'),
        r.warning ? 'warning' : 'success',
      );
      discard();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/recordings/${confirmFor.id}`, { method: 'DELETE' });
      toast.show(t('rec.deleted'));
      reload();
    } catch (e) {
      toast.show(errorMessage(e), 'danger');
    } finally {
      setDeleting(false);
      setConfirmFor(null);
    }
  }

  const label = {
    idle: t('rec.ready'),
    recording: t('rec.recording'),
    paused: t('rec.paused'),
    done: t('rec.readyDone'),
  }[phase];
  const busyRecording = phase === 'recording' || phase === 'paused';

  return (
    <Screen title={t('rec.title')} sub={t('rec.sub')} onRefresh={refresh} refreshing={refreshing}>
      {!busyRecording ? (
        <SegmentedTabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            setError(null);
          }}
          options={[
            { value: 'record', label: t('rec.tabRecord') },
            { value: 'upload', label: t('rec.tabUpload') },
          ]}
        />
      ) : null}

      <Card>
        {tab === 'record' || busyRecording ? (
          <>
            <Text
              accessibilityRole="timer"
              accessibilityLabel={t('rec.timeA11y', { time: formatDuration(elapsed) })}
              style={{
                fontSize: 44,
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
                marginTop: 6,
                color: timerColor,
                fontWeight: '300',
              }}
            >
              {formatDuration(elapsed)}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 8,
              }}
              accessibilityLiveRegion="polite"
            >
              {phase === 'recording' ? <PulsingDot /> : null}
              <T>{label}</T>
            </View>
            <LevelMeter levels={levels} active={phase === 'recording'} />
            {overLimit ? (
              <T tone="warning" style={{ textAlign: 'center', fontSize: 13, marginBottom: 8 }}>
                {t('rec.overLimit', { n: creditsPerCall(elapsed) })}
              </T>
            ) : (
              <T tone="muted" style={{ textAlign: 'center', fontSize: 13, marginBottom: 8 }}>
                {t('rec.limitHint')}
              </T>
            )}
            <Row style={{ justifyContent: 'center', gap: 28, marginVertical: 8 }}>
              {phase === 'idle' || phase === 'done' ? (
                <RoundButton
                  icon="mic"
                  color={colors.danger}
                  onPress={start}
                  label={phase === 'done' ? t('rec.again') : t('rec.record')}
                  testID="rec-start"
                />
              ) : null}
              {phase === 'recording' ? (
                <>
                  <RoundButton
                    icon="pause"
                    color={colors.primary}
                    onPress={pause}
                    label={t('rec.pause')}
                  />
                  <RoundButton
                    icon="stop"
                    color={colors.danger}
                    onPress={stop}
                    label={t('rec.stop')}
                  />
                </>
              ) : null}
              {phase === 'paused' ? (
                <>
                  <RoundButton
                    icon="mic"
                    color={colors.primary}
                    onPress={resume}
                    label={t('rec.resume')}
                  />
                  <RoundButton
                    icon="stop"
                    color={colors.danger}
                    onPress={stop}
                    label={t('rec.stop')}
                  />
                </>
              ) : null}
            </Row>
          </>
        ) : (
          <View style={{ gap: 10, alignItems: 'flex-start' }}>
            <T tone="muted">{t('rec.uploadHint')}</T>
            <Button
              title={t('rec.chooseFile')}
              variant="secondary"
              icon="cloud-upload-outline"
              onPress={pickUpload}
            />
          </View>
        )}
        <ErrorText>{error}</ErrorText>

        {phase === 'done' && clip ? (
          <View
            style={{
              marginTop: 12,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
            }}
          >
            <T tone="muted" style={{ fontSize: 13, marginBottom: 6 }} numberOfLines={1}>
              {clip.name === 'recording.m4a' ? t('rec.newRecording') : clip.name}
            </T>
            <AudioPlayer uri={clip.uri} label={t('rec.play')} />
            <Field
              label={t('rec.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('rec.namePlaceholder')}
            />
            <Checkbox checked={identifies} onChange={setIdentifies} label={t('rec.identifies')} />
            <Row>
              <Button
                title={t('rec.save')}
                onPress={save}
                loading={saving}
                disabled={!name.trim() || !identifies}
              />
              <Button title={t('rec.discard')} variant="secondary" onPress={discard} />
            </Row>
          </View>
        ) : null}
      </Card>

      <Card>
        <H2>{t('rec.saved_title')}</H2>
        {!data ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={16} width="60%" />
            <Skeleton height={12} width="35%" />
          </View>
        ) : null}
        {data?.items.length === 0 ? (
          <EmptyState icon="mic-outline" title={t('rec.none')} message={t('rec.noneSub')} />
        ) : null}
        {data?.items.map((r) => (
          <View
            key={r.id}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T bold numberOfLines={1}>
                  {r.name}
                </T>
                <T tone="muted" style={{ fontSize: 13 }}>
                  {formatDuration(r.durationSec)} ·{' '}
                  {t(r.creditsPerCall > 1 ? 'rec.creditsMany' : 'rec.creditsOne', {
                    n: r.creditsPerCall,
                  })}
                </T>
              </View>
              <IconButton
                icon="ellipsis-horizontal"
                onPress={() => setMenuFor(r)}
                accessibilityLabel={t('rec.actions', { name: r.name })}
              />
            </View>
            <AudioPlayer recordingId={r.id} label={t('rec.play')} />
          </View>
        ))}
        {data?.items.length ? (
          <Button
            title={t('rec.useInCampaign')}
            variant="accent"
            icon="megaphone"
            onPress={() => navigation.navigate('Campaigns', { screen: 'CampaignWizard' })}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </Card>

      <ActionMenu
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        actions={[
          {
            label: t('rec.delete'),
            icon: 'trash-outline',
            tone: 'danger',
            onPress: () => setConfirmFor(menuFor),
          },
        ]}
      />
      <ConfirmSheet
        visible={!!confirmFor}
        title={t('rec.deleteConfirm')}
        message={t('rec.deleteMsg', { name: confirmFor?.name })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onClose={() => setConfirmFor(null)}
        busy={deleting}
      />
    </Screen>
  );
}
