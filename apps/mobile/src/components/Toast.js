// Short confirmation messages ("2 contacts added ✓") that fade in above the
// tab bar and disappear by themselves. Screen readers announce them.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '../theme';

const ToastContext = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const show = useCallback(
    (message, tone = 'success') => {
      clearTimeout(timer.current);
      setToast({ message, tone, key: Date.now() });
      AccessibilityInfo.announceForAccessibility?.(message);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
          setToast(null),
        );
      }, 2600);
    },
    [anim],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const icon = { success: 'checkmark-circle', danger: 'alert-circle', warning: 'warning' };
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: 84 + insets.bottom }}
        >
          <Animated.View
            testID="toast"
            accessibilityLiveRegion="polite"
            style={{
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
              backgroundColor: colors.text,
              borderRadius: radius.card,
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Ionicons
              name={icon[toast.tone] || icon.success}
              size={20}
              color={colors[toast.tone] || colors.success}
            />
            <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '600', flex: 1 }}>
              {toast.message}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
