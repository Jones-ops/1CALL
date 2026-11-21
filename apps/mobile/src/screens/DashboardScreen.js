import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '../utils/useApiData';
import { formatDate, useI18n } from '../i18n';
import {
  Button,
  Card,
  ErrorText,
  H2,
  MiniStat,
  ProgressBar,
  Screen,
  Skeleton,
  SkeletonCard,
  T,
  statusTone,
} from '../components/ui';
import BarChart from '../components/BarChart';
import { BRAND_BLUE, MIN_TOUCH, radius, useTheme } from '../theme';

const n = (v) => Number(v ?? 0).toLocaleString('en-US');

/** Credits + plan + the main action, always at the top. */
function HeroCard({ data, onStart }) {
  const { t, lang } = useI18n();
  const s = data?.stats;
  const sub = data?.subscription;
  return (
    <View
      style={{
        backgroundColor: BRAND_BLUE,
        borderRadius: radius.card,
        padding: 18,
        marginBottom: 16,
      }}
    >
      <Text style={{ color: '#c9d6f5', fontSize: 14 }}>{t('dash.availableCredits')}</Text>
      {s ? (
        <Text
          testID="stat-credits"
          style={{ color: '#fff', fontSize: 36, fontWeight: '800', marginVertical: 2 }}
          accessibilityLabel={`${t('dash.availableCredits')}: ${n(s.availableCredits)}`}
        >
          {n(s.availableCredits)}
        </Text>
      ) : (
        <Skeleton height={36} width="45%" style={{ marginVertical: 6, opacity: 0.4 }} />
      )}
      <Text style={{ color: '#dbe6ff', fontSize: 14 }}>
        {sub
          ? t('dash.planLine', { plan: sub.planName, date: formatDate(sub.expiresAt, lang) })
          : data
            ? t('dash.noPlan')
            : ' '}
      </Text>
      {s?.reservedCredits > 0 ? (
        <Text style={{ color: '#c9d6f5', fontSize: 13, marginTop: 2 }}>
          {t('dash.reserved', { n: n(s.reservedCredits) })}
        </Text>
      ) : null}
      <Button
        title={t('dash.startBroadcast')}
        variant="accent"
        big
        icon="megaphone"
        onPress={onStart}
        style={{ marginTop: 16 }}
        testID="start-broadcast"
      />
    </View>
  );
}

/** First-run checklist; hidden once all four steps are done. */
function GettingStarted({ stats, hasPlan, navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const steps = [
    {
      done: stats.contacts > 0,
      title: t('start.contacts'),
      sub: t('start.contactsSub'),
      icon: 'people',
      go: () => navigation.navigate('Contacts', { screen: 'ImportContacts' }),
    },
    {
      done: (stats.recordings ?? 0) > 0,
      title: t('start.record'),
      sub: t('start.recordSub'),
      icon: 'mic',
      go: () => navigation.navigate('Record'),
    },
    {
      done: hasPlan,
      title: t('start.plan'),
      sub: t('start.planSub'),
      icon: 'card',
      go: () => navigation.navigate('Account', { screen: 'Subscription' }),
    },
    {
      done: (stats.campaignsTotal ?? 0) > 0,
      title: t('start.launch'),
      sub: t('start.launchSub'),
      icon: 'megaphone',
      go: () => navigation.navigate('Campaigns', { screen: 'CampaignWizard' }),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return (
    <Card testID="getting-started">
      <H2 style={{ marginBottom: 4 }}>{t('start.title')}</H2>
      <T tone="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {t('start.progress', { done: doneCount, total: steps.length })}
      </T>
      <ProgressBar value={doneCount / steps.length} color={colors.success} />
      <View style={{ marginTop: 8 }}>
        {steps.map((s, i) => (
          <Pressable
            key={s.title}
            onPress={s.done ? undefined : s.go}
            accessibilityRole="button"
            accessibilityState={{ checked: s.done, disabled: s.done }}
            accessibilityLabel={`${i + 1}. ${s.title}${s.done ? `, ${t('start.done')}` : ''}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: MIN_TOUCH + 12,
              paddingVertical: 8,
              borderBottomWidth: i < steps.length - 1 ? 1 : 0,
              borderBottomColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name={s.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={s.done ? colors.success : colors.muted}
            />
            <View style={{ flex: 1 }}>
              <T
                bold
                style={s.done ? { color: colors.muted, textDecorationLine: 'line-through' } : null}
              >
                {s.title}
              </T>
              {!s.done ? (
                <T tone="muted" style={{ fontSize: 13 }}>
                  {s.sub}
                </T>
              ) : null}
            </View>
            {!s.done ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function LiveNow({ campaign, onOpen }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${t('dash.liveNow')}: ${campaign.name}, ${campaign.processed} / ${campaign.recipients}`}
      testID="live-now"
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
          <T tone="muted" style={{ fontSize: 13, fontWeight: '700' }}>
            {t('dash.liveNow').toUpperCase()}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T bold style={{ flex: 1, fontSize: 17 }} numberOfLines={1}>
            {campaign.name}
          </T>
          <T tone={statusTone(campaign.status)} style={{ fontSize: 13, fontWeight: '700' }}>
            {t(`status.${campaign.status}`)}
          </T>
        </View>
        <T tone="muted" style={{ fontSize: 13, marginVertical: 8 }}>
          {t('live.processed', { done: n(campaign.processed), total: n(campaign.recipients) })}
        </T>
        <ProgressBar value={campaign.recipients ? campaign.processed / campaign.recipients : 0} />
      </Card>
    </Pressable>
  );
}

export default function DashboardScreen({ navigation }) {
  const { t } = useI18n();
  const { data, error, refreshing, refresh } = useApiData('/dashboard');
  const s = data?.stats;
  const startBroadcast = () => navigation.navigate('Campaigns', { screen: 'CampaignWizard' });

  return (
    <Screen title={t('dash.title')} onRefresh={refresh} refreshing={refreshing}>
      <ErrorText>{error}</ErrorText>
      <HeroCard data={data} onStart={startBroadcast} />
      {!data && !error ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </>
      ) : null}
      {s ? (
        <>
          <GettingStarted stats={s} hasPlan={!!data.subscription} navigation={navigation} />
          {data.live ? (
            <LiveNow
              campaign={data.live}
              onOpen={() =>
                navigation.navigate('Campaigns', {
                  screen: 'CampaignLive',
                  params: { id: data.live.id },
                })
              }
            />
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <MiniStat value={n(s.answered)} label={t('dash.answered')} tone="success" />
            <MiniStat value={n(s.unanswered)} label={t('dash.unanswered')} tone="warning" />
            <MiniStat value={n(s.failed)} label={t('dash.failed')} tone="danger" />
            <MiniStat value={n(s.contacts)} label={t('dash.contacts')} />
            <MiniStat value={n(s.completedCampaigns)} label={t('dash.completed')} />
            <MiniStat value={n(s.activeCampaigns)} label={t('dash.active')} />
          </View>

          <Card>
            <H2>{t('dash.history')}</H2>
            {data.history.length ? (
              <>
                <BarChart
                  data={[...data.history].reverse()}
                  onPressItem={(d) =>
                    navigation.navigate('Campaigns', {
                      screen: 'CampaignLive',
                      params: { id: d.id },
                    })
                  }
                />
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
                  <Legend color="success" label={t('dash.answered')} />
                  <Legend color="accent" label={t('dash.unanswered')} />
                </View>
              </>
            ) : (
              <T tone="muted">{t('dash.noCampaigns')}</T>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Legend({ color, label }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors[color] }} />
      <T tone="muted" style={{ fontSize: 13 }}>
        {label}
      </T>
    </View>
  );
}
