import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { formatKes } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../utils/useApiData';
import AudioPlayer from '../../components/AudioPlayer';
import {
  Button,
  Card,
  ErrorText,
  Field,
  H2,
  Loading,
  Row,
  Screen,
  Sheet,
  Stat,
  StatGrid,
  T,
  statusTone,
} from '../../components/ui';
import { PaymentList } from '../account/PaymentsScreen';
import { useTheme } from '../../theme';

const TABS = [
  ['ov', 'Overview'],
  ['users', 'Users'],
  ['plans', 'Plans'],
  ['appr', 'Approvals'],
  ['pays', 'Payments'],
];

function Overview() {
  const { data, error } = useApiData('/admin/overview');
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;
  const p = data.platform;
  return (
    <>
      <StatGrid>
        <Stat value={formatKes(data.revenue.total)} label="Total revenue" />
        <Stat value={formatKes(data.revenue.today)} label="Today" />
        <Stat value={formatKes(data.revenue.month)} label="This month" />
        <Stat value={formatKes(data.revenue.year)} label="This year" />
        <Stat value={data.activeSubscriptions} label="Active subscriptions" />
        <Stat value={data.pendingPayments} label="Pending payments" tone="warning" />
        <Stat value={data.failedPayments} label="Failed payments" tone="danger" />
      </StatGrid>
      <Card>
        <H2>Platform activity</H2>
        <StatGrid>
          <Stat value={p.callsMade.toLocaleString()} label="Calls made" />
          <Stat value={p.activeCampaigns} label="Active campaigns" />
          <Stat value={p.creditsConsumed.toLocaleString()} label="Credits consumed" />
          <Stat value={formatKes(p.telecomSpendKes)} label="Telecom spend (est.)" />
          <Stat value={`${p.failedCallPct}%`} label="Failed calls" tone="danger" />
        </StatGrid>
      </Card>
      <Card>
        <H2>Most popular plans</H2>
        {data.popularPlans.length ? (
          data.popularPlans.map((x) => (
            <T key={x.planId} style={{ marginVertical: 4 }}>
              {x.name}: {x.purchases} sales · {formatKes(x.revenue)}
            </T>
          ))
        ) : (
          <T tone="muted">No sales yet.</T>
        )}
      </Card>
    </>
  );
}

function Users() {
  const { colors } = useTheme();
  const { data, error, reload } = useApiData('/admin/users');
  const [bonusFor, setBonusFor] = useState(null);
  const [credits, setCredits] = useState('100');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);

  async function patch(u, body) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      reload();
    } catch (e) {
      Alert.alert('Update failed', errorMessage(e));
    }
  }
  async function grant() {
    setErr(null);
    try {
      await api(`/admin/users/${bonusFor.id}/bonus`, {
        method: 'POST',
        body: { credits: Number(credits), reason: reason.trim() },
      });
      setBonusFor(null);
      setReason('');
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;
  return (
    <Card>
      {data.items.length === 0 ? <T tone="muted">No customers yet.</T> : null}
      {data.items.map((u) => (
        <View
          key={u.id}
          style={{
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 6,
          }}
        >
          <T bold>{u.orgName}</T>
          <T tone="muted" style={{ fontSize: 13 }}>
            {u.name} · {u.email}
          </T>
          <T style={{ fontSize: 14 }}>
            {u.plan || 'No plan'} · {u.credits.toLocaleString()} credits ·{' '}
            <T tone={statusTone(u.status)} style={{ fontWeight: '600', fontSize: 14 }}>
              {u.status}
            </T>
            {u.verified ? ' · verified' : ' · not verified'}
          </T>
          <Row>
            <Button
              title={u.status === 'active' ? 'Suspend' : 'Activate'}
              variant={u.status === 'active' ? 'danger' : 'primary'}
              onPress={() => patch(u, { status: u.status === 'active' ? 'suspended' : 'active' })}
            />
            <Button
              title={u.verified ? 'Unverify' : 'Verify'}
              variant="secondary"
              onPress={() => patch(u, { verified: !u.verified })}
            />
            <Button title="Bonus credits" variant="secondary" onPress={() => setBonusFor(u)} />
          </Row>
        </View>
      ))}
      <Sheet
        visible={!!bonusFor}
        onClose={() => setBonusFor(null)}
        title={`Bonus credits · ${bonusFor?.orgName ?? ''}`}
      >
        <Field
          label="Credits"
          value={credits}
          onChangeText={setCredits}
          keyboardType="number-pad"
        />
        <Field
          label="Reason (logged)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Compensation for outage"
        />
        <ErrorText>{err}</ErrorText>
        <Row style={{ marginTop: 12 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setBonusFor(null)} />
          <Button
            title="Grant credits"
            onPress={grant}
            disabled={!(Number(credits) > 0) || reason.trim().length < 3}
          />
        </Row>
      </Sheet>
    </Card>
  );
}

const NUM_FIELDS = [
  ['priceKes', 'Price (KES)'],
  ['credits', 'Credits'],
  ['days', 'Days'],
  ['maxRecipients', 'Max campaign'],
  ['concurrency', 'Concurrent'],
];

function PlanEditor({ plan, onSaved }) {
  const { colors } = useTheme();
  const [f, setF] = useState(() => ({
    ...plan,
    ...Object.fromEntries(NUM_FIELDS.map(([k]) => [k, String(plan[k])])),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const body = () => ({
    name: f.name.trim(),
    active: f.active,
    ...Object.fromEntries(NUM_FIELDS.map(([k]) => [k, Math.max(1, parseInt(f[k], 10) || 0)])),
  });

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      if (plan.id) await api(`/admin/plans/${plan.id}`, { method: 'PATCH', body: body() });
      else await api('/admin/plans', { method: 'POST', body: body() });
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    Alert.alert('Delete plan?', `${plan.name} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/admin/plans/${plan.id}`, { method: 'DELETE' });
            onSaved();
          } catch (e) {
            Alert.alert('Cannot delete', errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <Field label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {NUM_FIELDS.map(([k, label]) => (
          <Field
            key={k}
            label={label}
            value={f[k]}
            onChangeText={(v) => setF({ ...f, [k]: v.replace(/\D/g, '') })}
            keyboardType="number-pad"
            style={{ flexGrow: 1, flexBasis: '45%' }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <Switch
          value={f.active}
          onValueChange={(v) => setF({ ...f, active: v })}
          accessibilityLabel="Plan active"
          trackColor={{ true: colors.primary }}
        />
        <T>{f.active ? 'Active (shown to customers)' : 'Inactive (hidden)'}</T>
      </View>
      <ErrorText>{err}</ErrorText>
      <Row style={{ marginTop: 10 }}>
        <Button
          title={plan.id ? 'Save' : 'Add plan'}
          onPress={save}
          loading={busy}
          disabled={f.name.trim().length < 2}
        />
        {plan.id ? <Button title="Delete" variant="secondary" onPress={remove} /> : null}
      </Row>
    </Card>
  );
}

function Plans() {
  const { data, error, reload } = useApiData('/admin/plans');
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;
  return (
    <>
      {data.items.map((p) => (
        <PlanEditor key={`${p.id}-${p.name}-${p.priceKes}-${p.active}`} plan={p} onSaved={reload} />
      ))}
      {adding ? (
        <PlanEditor
          plan={{
            name: 'New plan',
            priceKes: 1000,
            credits: 100,
            days: 30,
            maxRecipients: 100,
            concurrency: 5,
            active: false,
          }}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : (
        <Button
          title="Add plan"
          onPress={() => setAdding(true)}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </>
  );
}

function Approvals() {
  const { colors } = useTheme();
  const { data, error, reload } = useApiData('/admin/approvals');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  async function decide(c, decision, why) {
    try {
      await api(`/admin/approvals/${c.id}`, {
        method: 'POST',
        body: { decision, reason: why || undefined },
      });
      setRejecting(null);
      setReason('');
      reload();
    } catch (e) {
      Alert.alert('Failed', errorMessage(e));
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading />;
  return (
    <Card>
      <T tone="muted" style={{ marginBottom: 8 }}>
        Political and promotional campaigns wait here until you approve them.
      </T>
      {data.items.length === 0 ? <T tone="muted">Nothing waiting for approval.</T> : null}
      {data.items.map((c) => (
        <View
          key={c.id}
          style={{
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 6,
          }}
        >
          <T bold>{c.name}</T>
          <T tone="muted" style={{ fontSize: 13 }}>
            {c.orgName} · {c.category} · {c.recipients.toLocaleString()} recipients
            {c.orgVerified ? '' : ' · org NOT verified'}
          </T>
          <AudioPlayer recordingId={c.recordingId} label="Listen" />
          <Row>
            <Button
              title="Approve"
              onPress={() => decide(c, 'approve')}
              disabled={!c.orgVerified}
            />
            <Button title="Reject" variant="danger" onPress={() => setRejecting(c)} />
          </Row>
        </View>
      ))}
      <Sheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Reject “${rejecting?.name ?? ''}”`}
      >
        <Field
          label="Reason (sent to the customer)"
          value={reason}
          onChangeText={setReason}
          multiline
        />
        <Row style={{ marginTop: 12 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setRejecting(null)} />
          <Button
            title="Reject campaign"
            variant="danger"
            onPress={() => decide(rejecting, 'reject', reason.trim())}
            disabled={reason.trim().length < 3}
          />
        </Row>
      </Sheet>
    </Card>
  );
}

function AdminPayments() {
  const { data, error } = useApiData('/admin/payments');
  if (error) return <ErrorText>{error}</ErrorText>;
  return <Card>{data ? <PaymentList items={data.items} showCustomer /> : <Loading />}</Card>;
}

export default function AdminScreen() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('ov');
  if (!isAdmin) {
    return (
      <Screen title="Not authorised" back>
        <T>This area is for platform administrators.</T>
      </Screen>
    );
  }
  return (
    <Screen title="Administrator" sub="Platform owner view." back>
      <Row style={{ marginBottom: 14 }}>
        {TABS.map(([k, label]) => (
          <Button
            key={k}
            title={label}
            variant={tab === k ? 'primary' : 'secondary'}
            onPress={() => setTab(k)}
            accessibilityLabel={`${label} tab`}
          />
        ))}
      </Row>
      {tab === 'ov' ? <Overview /> : null}
      {tab === 'users' ? <Users /> : null}
      {tab === 'plans' ? <Plans /> : null}
      {tab === 'appr' ? <Approvals /> : null}
      {tab === 'pays' ? <AdminPayments /> : null}
    </Screen>
  );
}
