import { goTo } from '../../utils/goTo';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../utils/useApiData';
import { LANGUAGES, formatDate, useI18n } from '../../i18n';
import { Avatar, Button, Card, H2, Screen, SegmentedTabs, Skeleton, T } from '../../components/ui';
import { MIN_TOUCH, useTheme } from '../../theme';

function MenuItem({ icon, title, sub, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: MIN_TOUCH + 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <T bold>{title}</T>
        {sub ? (
          <T tone="muted" style={{ fontSize: 13 }}>
            {sub}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function AccountScreen({ navigation }) {
  const { user, signOut, isAdmin } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { data, refresh, refreshing } = useApiData('/me');
  const sub = data?.subscription;

  return (
    <Screen title={t('account.title')} onRefresh={refresh} refreshing={refreshing}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar name={user?.name} size={48} />
          <View style={{ flex: 1 }}>
            <T bold style={{ fontSize: 17 }}>
              {user?.name}
            </T>
            <T tone="muted" style={{ fontSize: 13 }} numberOfLines={1}>
              {user?.org?.name} · {user?.email}
            </T>
          </View>
        </View>
        {data ? (
          <>
            <T>
              <T bold>{t('account.plan')}</T>{' '}
              {sub
                ? t('dash.planLine', { plan: sub.planName, date: formatDate(sub.expiresAt, lang) })
                : t('account.none')}
            </T>
            <T style={{ marginTop: 4 }}>
              <T bold>{(data.balance.available ?? 0).toLocaleString()}</T>{' '}
              {t('account.creditsAvailable')}
              {data.balance.reserved
                ? ` · ${t('account.reserved', { n: data.balance.reserved.toLocaleString() })}`
                : ''}
            </T>
          </>
        ) : (
          <View style={{ gap: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} width="50%" />
          </View>
        )}
        {user?.org && !user.org.verified ? (
          <T tone="warning" style={{ marginTop: 8, fontSize: 13 }}>
            {t('account.notVerified')}
          </T>
        ) : null}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <MenuItem
          icon="star-outline"
          title={t('account.subscription')}
          sub={t('account.subscriptionSub')}
          onPress={() => goTo(navigation, 'Subscription')}
        />
        <MenuItem
          icon="card-outline"
          title={t('account.payments')}
          sub={t('account.paymentsSub')}
          onPress={() => goTo(navigation, 'Payments')}
        />
        {isAdmin ? (
          <MenuItem
            icon="settings-outline"
            title={t('account.admin')}
            sub={t('account.adminSub')}
            onPress={() => navigation.navigate('Admin')}
          />
        ) : null}
      </Card>
      <Card>
        <H2>{t('account.language')}</H2>
        <SegmentedTabs
          value={lang}
          onChange={setLang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          testID="language-switch"
        />
      </Card>
      <Card>
        <H2>{t('account.data')}</H2>
        <T tone="muted" style={{ fontSize: 14 }}>
          {t('account.dataText')}
        </T>
      </Card>
      <Button
        title={t('account.signOut')}
        variant="secondary"
        icon="log-out-outline"
        onPress={signOut}
      />
    </Screen>
  );
}
