import { View } from 'react-native';
import { useApiData } from '../utils/useApiData';
import {
  Button,
  Card,
  ErrorText,
  H2,
  Loading,
  Screen,
  Stat,
  StatGrid,
  Sub,
  T,
  Table,
} from '../components/ui';
import BarChart from '../components/BarChart';

const n = (v) => Number(v ?? 0).toLocaleString('en-US');

export default function DashboardScreen({ navigation }) {
  const { data, error, refreshing, refresh } = useApiData('/dashboard');
  const s = data?.stats;

  return (
    <Screen
      title="Dashboard"
      sub={
        data?.subscription
          ? `${data.subscription.planName} plan · expires ${new Date(data.subscription.expiresAt).toLocaleDateString()}`
          : 'No active plan — choose one under Account › Subscription.'
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <ErrorText>{error}</ErrorText>
      {!data && !error ? <Loading /> : null}
      {s ? (
        <>
          <StatGrid>
            <Stat value={n(s.availableCredits)} label="Available credits" testID="stat-credits" />
            <Stat value={n(s.contacts)} label="Contacts" />
            <Stat value={n(s.answered)} label="Answered calls" tone="success" />
            <Stat value={n(s.unanswered)} label="Unanswered" tone="warning" />
            <Stat value={n(s.failed)} label="Failed" tone="danger" />
            <Stat value={n(s.completedCampaigns)} label="Completed campaigns" />
            <Stat value={n(s.activeCampaigns)} label="Active campaigns" />
          </StatGrid>
          {s.reservedCredits > 0 ? (
            <T tone="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>
              {n(s.reservedCredits)} credits are reserved for running campaigns.
            </T>
          ) : null}

          <Card>
            <H2>Campaign history</H2>
            {data.history.length ? (
              <>
                <BarChart data={data.history} />
                <Sub style={{ marginBottom: 8, marginTop: 4 }}>
                  Green: answered · Orange: unanswered
                </Sub>
                <Table
                  columns={[
                    { key: 'name', label: 'Campaign', flex: 2 },
                    { key: 'answered', label: 'Answered' },
                    { key: 'unanswered', label: 'Unans.' },
                    { key: 'failed', label: 'Failed' },
                  ]}
                  rows={data.history}
                />
              </>
            ) : (
              <T tone="muted">No campaigns yet. Your results will appear here.</T>
            )}
          </Card>
        </>
      ) : null}
      <View>
        <Button
          title="START A VOICE BROADCAST"
          variant="accent"
          big
          onPress={() => navigation.navigate('Campaigns', { screen: 'CampaignWizard' })}
          testID="start-broadcast"
        />
      </View>
    </Screen>
  );
}
