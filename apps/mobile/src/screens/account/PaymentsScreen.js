import { View } from 'react-native';
import { formatKes } from '@1call/shared';
import { useApiData } from '../../utils/useApiData';
import { Button, Card, ErrorText, H2, Loading, Screen, T, statusTone } from '../../components/ui';
import { useTheme } from '../../theme';

export function PaymentList({ items, showCustomer = false }) {
  const { colors } = useTheme();
  if (!items.length) return <T tone="muted">No payments yet.</T>;
  return items.map((p) => (
    <View
      key={p.id}
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <T bold numberOfLines={1}>
          {showCustomer ? `${p.orgName} · ` : ''}
          {p.planName}
        </T>
        <T tone="muted" style={{ fontSize: 13 }}>
          {new Date(p.createdAt).toLocaleDateString()} · Receipt {p.mpesaReceipt || '—'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T>{formatKes(p.amountKes)}</T>
        <T tone={statusTone(p.status)} style={{ fontWeight: '600', fontSize: 13 }}>
          {p.status}
        </T>
      </View>
    </View>
  ));
}

export default function PaymentsScreen({ navigation }) {
  const { data, error, refresh, refreshing } = useApiData('/payments');
  return (
    <Screen
      title="Payments"
      sub="Pay with M-Pesa STK Push."
      back
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Card>
        <T style={{ marginBottom: 10 }}>Buy credits by choosing a plan.</T>
        <Button
          title="Choose a plan"
          onPress={() => navigation.navigate('Subscription')}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>
      <Card>
        <H2>Payment history</H2>
        <ErrorText>{error}</ErrorText>
        {data ? <PaymentList items={data.items} /> : <Loading />}
      </Card>
    </Screen>
  );
}
