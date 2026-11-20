import { View } from 'react-native';
import { formatKes } from '@1call/shared';
import { useApiData } from '../../utils/useApiData';
import { Button, Card, ErrorText, H2, Loading, Screen, T } from '../../components/ui';
import { radius, useTheme } from '../../theme';

export default function SubscriptionScreen({ navigation }) {
  const { colors } = useTheme();
  const sub = useApiData('/subscription');
  const plans = useApiData('/plans');
  const s = sub.data?.subscription;

  return (
    <Screen
      title="Subscription"
      sub="1 credit is charged per answered call of up to 30 seconds."
      back
      onRefresh={() => {
        sub.refresh();
        plans.refresh();
      }}
      refreshing={sub.refreshing || plans.refreshing}
    >
      <Card>
        <T>
          <T bold>Current plan:</T>{' '}
          {s ? `${s.plan.name} · expires ${new Date(s.expiresAt).toLocaleDateString()}` : 'None'} ·{' '}
          <T bold>{(sub.data?.balance.available ?? 0).toLocaleString()}</T> credits available
        </T>
      </Card>
      <ErrorText>{plans.error}</ErrorText>
      {!plans.data ? <Loading /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {plans.data?.items.map((p) => (
          <View
            key={p.id}
            testID={`plan-${p.name}`}
            style={{
              flexGrow: 1,
              flexBasis: '45%',
              minWidth: 150,
              backgroundColor: colors.card,
              borderColor: s?.plan.id === p.id ? colors.accent : colors.border,
              borderWidth: s?.plan.id === p.id ? 2 : 1,
              borderRadius: radius.card,
              padding: 14,
            }}
          >
            <H2>{p.name}</H2>
            <T style={{ fontSize: 24, fontWeight: '700' }}>{formatKes(p.priceKes)}</T>
            <T tone="muted" style={{ fontSize: 13, marginVertical: 6 }}>
              {p.credits.toLocaleString()} credits · {p.days} days{'\n'}Up to{' '}
              {p.maxRecipients.toLocaleString()} recipients per campaign{'\n'}
              {p.concurrency} concurrent calls
            </T>
            <Button
              title="Choose"
              onPress={() => navigation.navigate('Pay', { plan: p })}
              accessibilityLabel={`Choose ${p.name} plan`}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}
