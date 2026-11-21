// Play/pause control for a local file URI or a saved recording (fetches a
// short-lived signed URL from the API).
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { formatDuration } from '@1call/shared';
import { api } from '../api/client';
import { Button, T } from './ui';
import { useI18n } from '../i18n';

export default function AudioPlayer({ uri, recordingId, label = 'Play' }) {
  const { t } = useI18n();
  const [error, setError] = useState(null);
  const loaded = useRef(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    loaded.current = null;
    player.pause();
  }, [uri, recordingId, player]);

  async function toggle() {
    setError(null);
    try {
      if (status.playing) return player.pause();
      const key = uri || recordingId;
      if (loaded.current !== key) {
        // Signed URLs expire after a few minutes, so fetch one per playback session.
        const url = uri || (await api(`/recordings/${recordingId}/url`)).url;
        player.replace({ uri: url });
        loaded.current = key;
      }
      if (
        status.didJustFinish ||
        (status.duration && status.currentTime >= status.duration - 0.1)
      ) {
        await player.seekTo(0);
      }
      player.play();
    } catch (e) {
      setError(e.message || t('audio.error'));
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Button
        title={status.playing ? t('audio.pause') : label}
        icon={status.playing ? 'pause' : 'play'}
        variant="secondary"
        onPress={toggle}
        accessibilityLabel={status.playing ? t('audio.pauseA11y') : t('audio.playA11y', { label })}
      />
      {status.duration ? (
        <T tone="muted" style={{ fontSize: 13 }}>
          {formatDuration(status.currentTime)} / {formatDuration(status.duration)}
        </T>
      ) : null}
      {error ? (
        <T tone="danger" style={{ fontSize: 13 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}
