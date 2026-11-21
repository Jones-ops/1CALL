// Swipe a row to the left to reveal a red Delete button. Built on React
// Native's PanResponder (no extra native library). The row's "⋯" menu stays
// available for screen-reader users and anyone who prefers tapping.
import { useRef } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';

const ACTION_WIDTH = 96;

export default function SwipeRow({ children, onDelete, deleteLabel, testID }) {
  const { colors } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const settle = (open) => {
    isOpen.current = open;
    Animated.spring(x, {
      toValue: open ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // Only take over clearly horizontal drags, so vertical scrolling still works.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        x.setValue(Math.min(0, Math.max(-ACTION_WIDTH * 1.3, base + g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        const open = base + g.dx < -ACTION_WIDTH / 2;
        if (open && !isOpen.current) haptic.tap();
        settle(open);
      },
      onPanResponderTerminate: () => settle(isOpen.current),
    }),
  ).current;

  return (
    <View style={{ overflow: 'hidden' }} testID={testID}>
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: ACTION_WIDTH,
          backgroundColor: colors.danger,
        }}
      >
        <Pressable
          onPress={() => {
            settle(false);
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
