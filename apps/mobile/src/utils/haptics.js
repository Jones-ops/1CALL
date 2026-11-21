// Light vibration feedback on key actions. Never throws; does nothing on web.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function safe(fn) {
  if (Platform.OS === 'web') return;
  try {
    const p = fn();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* haptics are optional */
  }
}

export const haptic = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
