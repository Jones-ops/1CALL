import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { formatDuration } from '@1call/shared';
import { api, errorMessage } from '../api/client';
import { useApiData } from '../utils/useApiData';
import AudioPlayer from '../components/AudioPlayer';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Field,
  H2,
  Label,
  Loading,
  Row,
  Screen,
  T,
} from '../components/ui';
import { useTheme } from '../theme';

function PulsingDot() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
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

export default function RecordScreen({ navigation }) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState('idle'); // idle | recording | paused | done
  const [clip, setClip] = useState(null); // { uri, name, type, durationSec }
  const [name, setName] = useState('');
  const [identifies, setIdentifies] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data, refresh, refreshing, reload } = useApiData('/recordings');

  const elapsed =
    phase === 'done' ? (clip?.durationSec ?? 0) : (recState.durationMillis || 0) / 1000;

  async function start() {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(
          'Microphone permission was denied. Allow microphone access in your phone settings, or upload an audio file below.',
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setClip(null);
      setPhase('recording');
    } catch (e) {
      setError(`Could not start recording: ${e.message}`);
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
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) {
      setError('The recording could not be saved on this phone.');
      setPhase('idle');
      return;
    }
    setClip({ uri: recorder.uri, name: 'recording.m4a', type: 'audio/m4a', durationSec });
    setPhase('done');
  }

  function discard() {
    setClip(null);
    setPhase('idle');
    setName('');
    setIdentifies(false);
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
      setError('Choose an MP3, WAV or M4A file.');
      return;
    }
    setClip({ uri: a.uri, name: a.name, type: a.mimeType || 'audio/mpeg', durationSec: null });
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
      form.append('file', { uri: clip.uri, name: clip.name, type: clip.type });
      const r = await api('/recordings', { method: 'POST', form });
      if (r.warning) Alert.alert('Longer than 30 seconds', r.warning);
      discard();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function remove(rec) {
    Alert.alert(
      'Delete recording?',
      `“${rec.name}” will be removed. Past campaigns keep their results.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/recordings/${rec.id}`, { method: 'DELETE' });
              reload();
            } catch (e) {
              Alert.alert('Could not delete', errorMessage(e));
            }
          },
        },
      ],
    );
  }

  const label = {
    idle: 'Ready',
    recording: 'Recording',
    paused: 'Paused',
    done: 'Recording ready',
  }[phase];

  return (
    <Screen
      title="Record Voice"
      sub="Record on this phone, or upload MP3, WAV or M4A. Audio is converted to the format the phone network needs."
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Card>
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`Recording time ${formatDuration(elapsed)}`}
          style={{
            fontSize: 40,
            fontVariant: ['tabular-nums'],
            textAlign: 'center',
            marginVertical: 10,
            color: colors.text,
          }}
        >
          {formatDuration(elapsed)}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12,
          }}
          accessibilityLiveRegion="polite"
        >
          {phase === 'recording' ? <PulsingDot /> : null}
          <T>{label}</T>
        </View>
        <Row style={{ justifyContent: 'center' }}>
          {phase === 'idle' || phase === 'done' ? (
            <Button
              title={phase === 'done' ? '● Record again' : '● Record'}
              variant="danger"
              onPress={start}
            />
          ) : null}
          {phase === 'recording' ? (
            <Button title="Pause" variant="secondary" onPress={pause} />
          ) : null}
          {phase === 'paused' ? (
            <Button title="Resume" variant="secondary" onPress={resume} />
          ) : null}
          {phase === 'recording' || phase === 'paused' ? (
            <Button title="Stop" onPress={stop} />
          ) : null}
        </Row>
        <ErrorText>{error}</ErrorText>

        {phase === 'done' && clip ? (
          <View style={{ marginTop: 12 }}>
            <AudioPlayer uri={clip.uri} label="Play" />
            {clip.durationSec > 30 ? (
              <T tone="warning" style={{ marginTop: 8, fontSize: 13 }}>
                This message is over 30 seconds, so each answered call will cost more than 1 credit.
              </T>
            ) : null}
            <Field
              label="Name this recording"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Rally invitation"
            />
            <Checkbox
              checked={identifies}
              onChange={setIdentifies}
              label="This message says clearly who is calling."
            />
            <Row>
              <Button
                title="Save recording"
                onPress={save}
                loading={saving}
                disabled={!name.trim() || !identifies}
              />
              <Button title="Discard" variant="secondary" onPress={discard} />
            </Row>
          </View>
        ) : null}

        <Label>Or upload an existing audio file</Label>
        <Button
          title="Choose audio file"
          variant="secondary"
          icon="cloud-upload-outline"
          onPress={pickUpload}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>

      <Card>
        <H2>Saved recordings</H2>
        {!data ? <Loading /> : null}
        {data?.items.length === 0 ? <T tone="muted">No recordings yet.</T> : null}
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
            <T bold>{r.name}</T>
            <T tone="muted" style={{ fontSize: 13 }}>
              {formatDuration(r.durationSec)} · {r.creditsPerCall} credit
              {r.creditsPerCall > 1 ? 's' : ''} per answered call
            </T>
            <Row>
              <AudioPlayer recordingId={r.id} />
              <Button
                title="Delete"
                variant="secondary"
                onPress={() => remove(r)}
                accessibilityLabel={`Delete ${r.name}`}
              />
            </Row>
          </View>
        ))}
        {data?.items.length ? (
          <Button
            title="Use in a campaign"
            variant="accent"
            onPress={() => navigation.navigate('Campaigns', { screen: 'CampaignWizard' })}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}
