import { useState } from 'react';
import { Switch, View } from 'react-native';
import { formatKes } from '@1call/shared';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../utils/useApiData';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/Toast';
import AudioPlayer from '../../components/AudioPlayer';
import {
  ActionMenu,
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorText,
  Field,
  H2,
  IconButton,
  Row,
  Screen,
  SegmentedTabs,
  Sheet,
  SkeletonCard,
  Stat,
  StatGrid,
  T,
  Tag,
  statusTone,
} from '../../components/ui';
import { PaymentList } from '../account/PaymentsScreen';
import { useTheme } from '../../theme';

function Overview() {
  const { t } = useI18n();
  const { data, error } = useApiData('/admin/overview');
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <SkeletonCard lines={5} />;
  const p = data.platform;
  return (
    <>
      <StatGrid>
        <Stat value={formatKes(data.revenue.total)} label={t('admin.revTotal')} />
        <Stat value={formatKes(data.revenue.today)} label={t('admin.revToday')} />
        <Stat value={formatKes(data.revenue.month)} label={t('admin.revMonth')} />
        <Stat value={formatKes(data.revenue.year)} label={t('admin.revYear')} />
        <Stat value={data.activeSubscriptions} label={t('admin.activeSubs')} />
        <Stat value={data.pendingPayments} label={t('admin.pendingPays')} tone="warning" />
        <Stat value={data.failedPayments} label={t('admin.failedPays')} tone="danger" />
      </StatGrid>
      <Card>
        <H2>{t('admin.activity')}</H2>
        <StatGrid>
          <Stat value={p.callsMade.toLocaleString()} label={t('admin.callsMade')} />
          <Stat value={p.activeCampaigns} label={t('admin.activeCampaigns')} />
          <Stat value={p.creditsConsumed.toLocaleString()} label={t('admin.creditsConsumed')} />
          <Stat value={formatKes(p.telecomSpendKes)} label={t('admin.telecomSpend')} />
          <Stat value={`${p.failedCallPct}%`} label={t('admin.failedCalls')} tone="danger" />
        </StatGrid>
      </Card>
      <Card>
        <H2>{t('admin.popular')}</H2>
        {data.popularPlans.length ? (
          data.popularPlans.map((x) => (
            <T key={x.planId} style={{ marginVertical: 4 }}>
              {t('admin.popularRow', {
                name: x.name,
                n: x.purchases,
                revenue: formatKes(x.revenue),
              })}
            </T>
          ))
        ) : (
          <T tone="muted">{t('admin.noSales')}</T>
        )}
      </Card>
    </>
  );
}

function Users() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useApiData('/admin/users');
  const [menuFor, setMenuFor] = useState(null);
  const [suspendFor, setSuspendFor] = useState(null);
  const [bonusFor, setBonusFor] = useState(null);
  const [credits, setCredits] = useState('100');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function patch(u, body, message) {
    setBusy(true);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      toast.show(message);
      reload();
    } catch (e) {
      toast.show(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
      setSuspendFor(null);
    }
  }
  async function grant() {
    setErr(null);
    setBusy(true);
    try {
      await api(`/admin/users/${bonusFor.id}/bonus`, {
        method: 'POST',
        body: { credits: Number(credits), reason: reason.trim() },
      });
      toast.show(t('admin.bonusDone', { n: credits, org: bonusFor.orgName }));
      setBonusFor(null);
      setReason('');
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <SkeletonCard lines={4} />;
  return (
    <Card>
      {data.items.length === 0 ? (
        <EmptyState icon="people-outline" title={t('admin.noCustomers')} />
      ) : null}
      {data.items.map((u) => (
        <View
          key={u.id}
          style={{
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Avatar name={u.orgName} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T bold numberOfLines={1}>
              {u.orgName}
            </T>
            <T tone="muted" style={{ fontSize: 13 }} numberOfLines={1}>
              {u.name} · {u.email}
            </T>
            <T style={{ fontSize: 13 }}>
              {u.plan || t('admin.noPlan')} ·{' '}
              {t('admin.credits', { n: u.credits.toLocaleString() })}
            </T>
            <Row style={{ gap: 6 }}>
              <Tag label={t(`orgStatus.${u.status}`)} tone={statusTone(u.status)} />
              <Tag
                label={u.verified ? t('admin.verified') : t('admin.notVerified')}
                tone={u.verified ? 'success' : 'muted'}
              />
            </Row>
          </View>
          <IconButton
            icon="ellipsis-horizontal"
            onPress={() => setMenuFor(u)}
            accessibilityLabel={t('admin.userActions', { org: u.orgName })}
          />
        </View>
      ))}

      <ActionMenu
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.orgName}
        actions={
          menuFor
            ? [
                {
                  label: t('admin.bonus'),
                  icon: 'gift-outline',
                  onPress: () => setBonusFor(menuFor),
                },
                {
                  label: menuFor.verified ? t('admin.unverify') : t('admin.verify'),
                  icon: menuFor.verified ? 'shield-outline' : 'shield-checkmark-outline',
                  onPress: () =>
                    patch(
                      menuFor,
                      { verified: !menuFor.verified },
                      t(menuFor.verified ? 'admin.unverifiedDone' : 'admin.verifiedDone'),
                    ),
                },
                menuFor.status === 'active'
                  ? {
                      label: t('admin.suspend'),
                      icon: 'pause-circle-outline',
                      tone: 'danger',
                      onPress: () => setSuspendFor(menuFor),
                    }
                  : {
                      label: t('admin.activate'),
                      icon: 'play-circle-outline',
                      onPress: () => patch(menuFor, { status: 'active' }, t('admin.activatedDone')),
                    },
              ]
            : []
        }
      />
      <ConfirmSheet
        visible={!!suspendFor}
        title={t('admin.suspendTitle', { org: suspendFor?.orgName })}
        message={t('admin.suspendMsg')}
        confirmLabel={t('admin.suspend')}
        onConfirm={() => patch(suspendFor, { status: 'suspended' }, t('admin.suspendedDone'))}
        onClose={() => setSuspendFor(null)}
        busy={busy}
      />
      <Sheet
        visible={!!bonusFor}
        onClose={() => setBonusFor(null)}
        title={t('admin.bonusTitle', { org: bonusFor?.orgName ?? '' })}
      >
        <Field
          label={t('admin.bonusCredits')}
          value={credits}
          onChangeText={setCredits}
          keyboardType="number-pad"
        />
        <Field
          label={t('admin.bonusReason')}
          value={reason}
          onChangeText={setReason}
          placeholder={t('admin.bonusReasonPh')}
        />
        <ErrorText>{err}</ErrorText>
        <Row style={{ marginTop: 12 }}>
          <Button
            title={t('common.cancel')}
            variant="secondary"
            onPress={() => setBonusFor(null)}
          />
          <Button
            title={t('admin.grant')}
            onPress={grant}
            loading={busy}
            disabled={!(Number(credits) > 0) || reason.trim().length < 3}
          />
        </Row>
      </Sheet>
    </Card>
  );
}

const NUM_FIELDS = ['priceKes', 'credits', 'days', 'maxRecipients', 'concurrency'];

function PlanEditor({ plan, onSaved }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState(() => ({
    ...plan,
    ...Object.fromEntries(NUM_FIELDS.map((k) => [k, String(plan[k])])),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const body = () => ({
    name: f.name.trim(),
    active: f.active,
    ...Object.fromEntries(NUM_FIELDS.map((k) => [k, Math.max(1, parseInt(f[k], 10) || 0)])),
  });

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      if (plan.id) await api(`/admin/plans/${plan.id}`, { method: 'PATCH', body: body() });
      else await api('/admin/plans', { method: 'POST', body: body() });
      toast.show(t('admin.planSaved', { name: f.name.trim() }));
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/plans/${plan.id}`, { method: 'DELETE' });
      toast.show(t('admin.planDeleted', { name: plan.name }));
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Card>
      <Field
        label={t('admin.planName')}
        value={f.name}
        onChangeText={(v) => setF({ ...f, name: v })}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {NUM_FIELDS.map((k) => (
          <Field
            key={k}
            label={t(`admin.f_${k}`)}
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
          accessibilityLabel={t('admin.planActiveA11y')}
          trackColor={{ true: colors.primary }}
        />
        <T style={{ flex: 1 }}>{f.active ? t('admin.planActive') : t('admin.planInactive')}</T>
      </View>
      <ErrorText>{err}</ErrorText>
      <Row style={{ marginTop: 10 }}>
        <Button
          title={plan.id ? t('common.save') : t('admin.addPlan')}
          onPress={save}
          loading={busy}
          disabled={f.name.trim().length < 2}
        />
        {plan.id ? (
          <Button
            title={t('common.delete')}
            variant="secondary"
            onPress={() => setConfirmDelete(true)}
          />
        ) : null}
      </Row>
      <ConfirmSheet
        visible={confirmDelete}
        title={t('admin.deletePlanTitle', { name: plan.name })}
        message={t('admin.deletePlanMsg')}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        busy={busy}
      />
    </Card>
  );
}

function Plans() {
  const { t } = useI18n();
  const { data, error, reload } = useApiData('/admin/plans');
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <SkeletonCard lines={5} />;
  return (
    <>
      {data.items.map((p) => (
        <PlanEditor key={`${p.id}-${p.name}-${p.priceKes}-${p.active}`} plan={p} onSaved={reload} />
      ))}
      {adding ? (
        <PlanEditor
          plan={{
            name: t('admin.newPlan'),
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
          title={t('admin.addPlan')}
          icon="add"
          onPress={() => setAdding(true)}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </>
  );
}

function Approvals() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useApiData('/admin/approvals');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(c, decision, why) {
    setBusy(true);
    try {
      await api(`/admin/approvals/${c.id}`, {
        method: 'POST',
        body: { decision, reason: why || undefined },
      });
      toast.show(
        t(decision === 'approve' ? 'admin.approvedDone' : 'admin.rejectedDone', { name: c.name }),
      );
      setRejecting(null);
      setReason('');
      reload();
    } catch (e) {
      toast.show(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <SkeletonCard lines={3} />;
  return (
    <Card>
      <T tone="muted" style={{ marginBottom: 8 }}>
        {t('admin.approvalsHint')}
      </T>
      {data.items.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title={t('admin.noApprovals')} />
      ) : null}
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
            {c.orgName} · {t(`category.${c.category}`)} ·{' '}
            {t('admin.recipients', { n: c.recipients.toLocaleString() })}
            {c.orgVerified ? '' : ` · ${t('admin.orgNotVerified')}`}
          </T>
          <AudioPlayer recordingId={c.recordingId} label={t('admin.listen')} />
          <Row>
            <Button
              title={t('admin.approve')}
              icon="checkmark"
              onPress={() => decide(c, 'approve')}
              disabled={!c.orgVerified || busy}
            />
            <Button title={t('admin.reject')} variant="danger" onPress={() => setRejecting(c)} />
          </Row>
        </View>
      ))}
      <Sheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('admin.rejectTitle', { name: rejecting?.name ?? '' })}
      >
        <Field label={t('admin.rejectReason')} value={reason} onChangeText={setReason} multiline />
        <Row style={{ marginTop: 12 }}>
          <Button
            title={t('common.cancel')}
            variant="secondary"
            onPress={() => setRejecting(null)}
          />
          <Button
            title={t('admin.rejectConfirm')}
            variant="danger"
            onPress={() => decide(rejecting, 'reject', reason.trim())}
            disabled={reason.trim().length < 3}
            loading={busy}
          />
        </Row>
      </Sheet>
    </Card>
  );
}

function AdminPayments() {
  const { data, error } = useApiData('/admin/payments');
  if (error) return <ErrorText>{error}</ErrorText>;
  return data ? (
    <Card>
      <PaymentList items={data.items} showCustomer />
    </Card>
  ) : (
    <SkeletonCard lines={4} />
  );
}

export default function AdminScreen() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState('ov');
  if (!isAdmin) {
    return (
      <Screen title={t('admin.notAuthorised')} back>
        <T>{t('admin.notAuthorisedText')}</T>
      </Screen>
    );
  }
  return (
    <Screen title={t('admin.title')} sub={t('admin.sub')} back>
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ov', label: t('admin.tabOverview') },
          { value: 'users', label: t('admin.tabUsers') },
          { value: 'plans', label: t('admin.tabPlans') },
          { value: 'appr', label: t('admin.tabApprovals') },
          { value: 'pays', label: t('admin.tabPayments') },
        ]}
      />
      {tab === 'ov' ? <Overview /> : null}
      {tab === 'users' ? <Users /> : null}
      {tab === 'plans' ? <Plans /> : null}
      {tab === 'appr' ? <Approvals /> : null}
      {tab === 'pays' ? <AdminPayments /> : null}
    </Screen>
  );
}
