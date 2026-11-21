// Campaign history as horizontal bars: one row per campaign with its full name,
// green = answered, orange = unanswered (scaled to the largest campaign).
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

export default function BarChart({ data, onPressItem }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.answered + d.unanswered + (d.failed || 0)));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={data
        .map((d) => t('chart.a11y', { name: d.name, a: d.answered, u: d.unanswered }))
        .join('. ')}
      style={{ gap: 12 }}
    >
      {data.map((d) => (
        <View key={d.id || d.name}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text
              style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}
              numberOfLines={1}
              onPress={onPressItem ? () => onPressItem(d) : undefined}
            >
              {d.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              <Text style={{ color: colors.success, fontWeight: '700' }}>{d.answered}</Text>
              {' · '}
              <Text style={{ color: colors.accent, fontWeight: '700' }}>{d.unanswered}</Text>
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              height: 10,
              borderRadius: 5,
              overflow: 'hidden',
              backgroundColor: colors.border,
              marginTop: 5,
            }}
          >
            <View
              style={{ width: `${(d.answered / max) * 100}%`, backgroundColor: colors.success }}
            />
            <View
              style={{ width: `${(d.unanswered / max) * 100}%`, backgroundColor: colors.accent }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
