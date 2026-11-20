import { Pressable, View } from 'react-native';
import { goTo } from '../../utils/goTo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../utils/useApiData';
import { Button, Card, H2, Screen, T } from '../../components/ui';
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
  const { data, refresh, refreshing } = useApiData('/me');
  const sub = data?.subscription;

  return (
    <Screen
      title="Account"
      sub={user ? `${user.name} · ${user.org?.name ?? ''}` : ''}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Card>
        <T>
          <T bold>Plan:</T>{' '}
          {sub
            ? `${sub.planName} · expires ${new Date(sub.expiresAt).toLocaleDateString()}`
            : 'None'}
        </T>
        <T style={{ marginTop: 4 }}>
          <T bold>{(data?.balance.available ?? 0).toLocaleString()}</T> credits available
          {data?.balance.reserved ? ` · ${data.balance.reserved.toLocaleString()} reserved` : ''}
        </T>
        {user?.org && !user.org.verified ? (
          <T tone="warning" style={{ marginTop: 8, fontSize: 13 }}>
            Your organisation is not verified yet. Promotional and political campaigns need
            verification.
          </T>
        ) : null}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <MenuItem
          icon="star-outline"
          title="Subscription"
          sub="Plans and credits"
          onPress={() => goTo(navigation, 'Subscription')}
        />
        <MenuItem
          icon="card-outline"
          title="Payments"
          sub="M-Pesa payment history"
          onPress={() => goTo(navigation, 'Payments')}
        />
        {isAdmin ? (
          <MenuItem
            icon="settings-outline"
            title="Admin"
            sub="Platform owner view"
            onPress={() => navigation.navigate('Admin')}
          />
        ) : null}
      </Card>
      <Card>
        <H2>Your data</H2>
        <T tone="muted" style={{ fontSize: 14 }}>
          Under Kenya’s Data Protection Act 2019 you can export your data or ask us to delete it.
          Contact support@1call.example.
        </T>
      </Card>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
