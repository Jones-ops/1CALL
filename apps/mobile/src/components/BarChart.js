import { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

const LABEL_FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif',
  default: 'system-ui, sans-serif',
});

/** Shorten a label to fit its bar slot (about 6 px per character at 10 px). */
function fitLabel(name, slotWidth) {
  const max = Math.max(3, Math.floor((slotWidth - 4) / 6));
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Grouped bars per campaign: green = answered, orange = unanswered. */
export default function BarChart({ data }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const h = 140;
  const base = h - 18;
  const max = Math.max(1, ...data.map((d) => Math.max(d.answered, d.unanswered)));
  const slot = data.length ? w / data.length : 0;
  const bar = Math.max(4, Math.min(28, slot * 0.32));
  const summary = data
    .map((d) => `${d.name}: ${d.answered} answered, ${d.unanswered} unanswered`)
    .join('. ');

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Answered versus unanswered calls per campaign. ${summary}`}
    >
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Line x1={0} x2={w} y1={base} y2={base} stroke={colors.border} strokeWidth={1} />
          {data.map((d, i) => {
            const cx = slot * i + slot / 2;
            const ha = (d.answered / max) * (base - 8);
            const hu = (d.unanswered / max) * (base - 8);
            return [
              <Rect
                key={`a${i}`}
                x={cx - bar - 1}
                y={base - ha}
                width={bar}
                height={ha}
                fill={colors.success}
                rx={2}
              />,
              <Rect
                key={`u${i}`}
                x={cx + 1}
                y={base - hu}
                width={bar}
                height={hu}
                fill={colors.accent}
                rx={2}
              />,
              <SvgText
                key={`l${i}`}
                x={cx}
                y={h - 4}
                fontSize="10"
                fontFamily={LABEL_FONT}
                fill={colors.muted}
                textAnchor="middle"
              >
                {fitLabel(d.name, slot)}
              </SvgText>,
            ];
          })}
        </Svg>
      ) : (
        <View style={{ height: h }} />
      )}
    </View>
  );
}
