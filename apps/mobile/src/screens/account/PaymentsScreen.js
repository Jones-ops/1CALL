import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatKes } from '@1call/shared';
import { goTo } from '../../utils/goTo';
import { useApiData } from '../../utils/useApiData';
import { formatDate, useI18n } from '../../i18n';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  H2,
  Screen,
  Skeleton,
  T,
  statusTone,
} from '../../components/ui';
import { useTheme } from '../../theme';

const STATUS_ICON = { succeeded: 'checkmark-circle', failed: 'close-circle', pending: 'time' };

export function PaymentList({ items, showCustomer = false }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  if (!items.length) {
    return <EmptyState icon="card-outline" title={t('payments.none')} />;
  }
  return items.map((p) => (
    <View
      key={p.id}
      style={{
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Ionicons
        name={STATUS_ICON[p.status] || 'ellipse'}
        size={24}
        color={colors[statusTone(p.status)] || colors.muted}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T bold numberOfLines={1}>
          {showCustomer ? `${p.orgName} · ` : ''}
          {p.planName}
        </T>
        <T tone="muted" style={{ fontSize: 13 }}>
          {formatDate(p.createdAt, lang)} · {t('payments.receipt', { r: p.mpesaReceipt || '—' })}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T>{formatKes(p.amountKes)}</T>
        <T tone={statusTone(p.status)} style={{ fontWeight: '600', fontSize: 13 }}>
          {t(`payStatus.${p.status}`)}
        </T>
      </View>
    </View>
  ));
}

export default function PaymentsScreen({ navigation }) {
  const { t } = useI18n();
  const { data, error, refresh, refreshing } = useApiData('/payments');
  return (
    <Screen
      title={t('payments.title')}
      sub={t('payments.sub')}
      back
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Button
        title={t('pay.choosePlan')}
        icon="star-outline"
        onPress={() => goTo(navigation, 'Subscription')}
        style={{ marginBottom: 16 }}
      />
      <Card>
        <H2>{t('payments.history')}</H2>
        <ErrorText>{error}</ErrorText>
        {data ? (
          <PaymentList items={data.items} />
        ) : (
          <View style={{ gap: 10 }}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={16} width="60%" />
          </View>
        )}
      </Card>
    </Screen>
  );
}
