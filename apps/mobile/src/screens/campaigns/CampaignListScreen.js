import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '../../utils/useApiData';
import { formatDate, useI18n } from '../../i18n';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  H2,
  ProgressBar,
  Screen,
  SkeletonCard,
  T,
  Tag,
  statusTone,
} from '../../components/ui';
import { useTheme } from '../../theme';

export default function CampaignListScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { data, error, refresh, refreshing } = useApiData('/campaigns');

  return (
    <Screen
      title={t('campaigns.title')}
      sub={t('campaigns.sub')}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <View style={{ marginBottom: 16 }}>
        <Button
          title={t('dash.startBroadcast')}
          variant="accent"
          big
          icon="megaphone"
          onPress={() => navigation.navigate('CampaignWizard')}
        />
      </View>
      <ErrorText>{error}</ErrorText>
      {!data && !error ? <SkeletonCard lines={4} /> : null}
      {data ? (
        <Card>
          <H2>{t('campaigns.yours')}</H2>
          {data.items.length === 0 ? (
            <EmptyState
              icon="megaphone-outline"
              title={t('campaigns.none')}
              message={t('campaigns.noneSub')}
            />
          ) : null}
          {data.items.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => navigation.navigate('CampaignLive', { id: c.id })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${t(`status.${c.status}`)}, ${t('live.processed', {
                done: c.processed,
                total: c.recipients,
              })}`}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.7 : 1,
                gap: 6,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T bold style={{ flex: 1 }} numberOfLines={1}>
                  {c.name}
                </T>
                <Tag label={t(`status.${c.status}`)} tone={statusTone(c.status)} />
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </View>
              <T tone="muted" style={{ fontSize: 13 }}>
                {formatDate(c.createdAt, lang)} · {c.groupName} ·{' '}
                {t('campaigns.rowStats', {
                  done: c.processed,
                  total: c.recipients,
                  answered: c.answered,
                })}
              </T>
              {['running', 'paused'].includes(c.status) ? (
                <ProgressBar value={c.recipients ? c.processed / c.recipients : 0} />
              ) : null}
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
