import { Text, View } from 'react-native';
import { formatKes } from '@1call/shared';
import { useApiData } from '../../utils/useApiData';
import { formatDate, useI18n } from '../../i18n';
import { Button, Card, ErrorText, H2, Screen, Skeleton, T } from '../../components/ui';
import { radius, useTheme } from '../../theme';

function Badge({ label, color }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: color,
        borderRadius: 99,
        paddingHorizontal: 10,
        paddingVertical: 3,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export default function SubscriptionScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const sub = useApiData('/subscription');
  const plans = useApiData('/plans');
  const s = sub.data?.subscription;
  const items = plans.data?.items ?? [];
  // KES per credit; 1 credit = 1 answered call of up to 30 seconds.
  const perCall = (p) => p.priceKes / p.credits;
  const bestValueId =
    items.length > 1 ? [...items].sort((a, b) => perCall(a) - perCall(b))[0].id : null;

  return (
    <Screen
      title={t('sub.title')}
      sub={t('sub.sub')}
      back
      onRefresh={() => {
        sub.refresh();
        plans.refresh();
      }}
      refreshing={sub.refreshing || plans.refreshing}
    >
      <Card>
        {sub.data ? (
          <T>
            <T bold>{t('sub.current')}</T>{' '}
            {s
              ? t('dash.planLine', { plan: s.plan.name, date: formatDate(s.expiresAt, lang) })
              : t('account.none')}{' '}
            · <T bold>{(sub.data.balance.available ?? 0).toLocaleString()}</T>{' '}
            {t('account.creditsAvailable')}
          </T>
        ) : (
          <Skeleton height={14} width="80%" />
        )}
      </Card>
      <ErrorText>{plans.error}</ErrorText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {!plans.data
          ? [0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 150, gap: 8 }}>
                <Skeleton height={150} radius={12} />
              </View>
            ))
          : null}
        {items.map((p) => {
          const current = s?.plan.id === p.id;
          return (
            <View
              key={p.id}
              testID={`plan-${p.name}`}
              style={{
                flexGrow: 1,
                flexBasis: '45%',
                minWidth: 150,
                backgroundColor: colors.card,
                borderColor: current
                  ? colors.accent
                  : p.id === bestValueId
                    ? colors.success
                    : colors.border,
                borderWidth: current || p.id === bestValueId ? 2 : 1,
                borderRadius: radius.card,
                padding: 14,
              }}
            >
              {current ? (
                <Badge label={t('sub.currentBadge')} color={colors.accent} />
              ) : p.id === bestValueId ? (
                <Badge label={t('sub.bestValue')} color={colors.success} />
              ) : null}
              <H2 style={{ marginBottom: 4 }}>{p.name}</H2>
              <T style={{ fontSize: 24, fontWeight: '800' }}>{formatKes(p.priceKes)}</T>
              <T tone="success" style={{ fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                {t('sub.perCall', { kes: perCall(p).toFixed(2) })}
              </T>
              <T tone="muted" style={{ fontSize: 13, marginVertical: 8 }}>
                {t('sub.details', {
                  credits: p.credits.toLocaleString(),
                  days: p.days,
                  max: p.maxRecipients.toLocaleString(),
                  conc: p.concurrency,
                })}
              </T>
              <Button
                title={current ? t('sub.renew') : t('sub.choose')}
                variant={current ? 'secondary' : 'primary'}
                onPress={() => navigation.navigate('Pay', { plan: p })}
                accessibilityLabel={t('sub.chooseA11y', { plan: p.name })}
              />
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
