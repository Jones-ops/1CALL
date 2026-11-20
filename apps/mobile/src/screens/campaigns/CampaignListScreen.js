import { Pressable, View } from 'react-native';
import { CAMPAIGN_STATUS_LABELS } from '@1call/shared';
import { useApiData } from '../../utils/useApiData';
import {
  Button,
  Card,
  ErrorText,
  H2,
  Loading,
  ProgressBar,
  Screen,
  T,
  Tag,
  statusTone,
} from '../../components/ui';
import { useTheme } from '../../theme';

export default function CampaignListScreen({ navigation }) {
  const { colors } = useTheme();
  const { data, error, refresh, refreshing } = useApiData('/campaigns');

  return (
    <Screen
      title="Voice Campaigns"
      sub="Broadcast one recorded message to a whole contact group."
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <View style={{ marginBottom: 16 }}>
        <Button
          title="START A VOICE BROADCAST"
          variant="accent"
          big
          onPress={() => navigation.navigate('CampaignWizard')}
        />
      </View>
      <Card>
        <H2>Your campaigns</H2>
        <ErrorText>{error}</ErrorText>
        {!data && !error ? <Loading /> : null}
        {data?.items.length === 0 ? <T tone="muted">No campaigns yet.</T> : null}
        {data?.items.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => navigation.navigate('CampaignLive', { id: c.id })}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, ${CAMPAIGN_STATUS_LABELS[c.status]}, ${c.processed} of ${c.recipients} processed`}
            style={({ pressed }) => ({
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              opacity: pressed ? 0.7 : 1,
              gap: 6,
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T bold style={{ flex: 1 }} numberOfLines={1}>
                {c.name}
              </T>
              <Tag label={CAMPAIGN_STATUS_LABELS[c.status]} tone={statusTone(c.status)} />
            </View>
            <T tone="muted" style={{ fontSize: 13 }}>
              {new Date(c.createdAt).toLocaleDateString()} · {c.groupName} · {c.processed}/
              {c.recipients} processed · {c.answered} answered
            </T>
            {['running', 'paused'].includes(c.status) ? (
              <ProgressBar value={c.recipients ? c.processed / c.recipients : 0} />
            ) : null}
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
