// Donut chart of call outcomes. segments: [{ value, color }], total = recipients.
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme';

export default function RingChart({
  segments,
  total,
  size = 128,
  stroke = 14,
  centerLabel,
  centerSub,
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sum = Math.max(
    total || 0,
    segments.reduce((a, s) => a + s.value, 0),
    1,
  );
  let offset = 0;
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const len = (s.value / sum) * c;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{centerLabel}</Text>
        {centerSub ? <Text style={{ color: colors.muted, fontSize: 12 }}>{centerSub}</Text> : null}
      </View>
    </View>
  );
}
