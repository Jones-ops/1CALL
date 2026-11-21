import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, errorMessage } from '../api/client';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import {
  ActionMenu,
  Avatar,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Screen,
  ScreenHeader,
  SegmentedTabs,
  Skeleton,
  T,
  Tag,
} from '../components/ui';
import { useTheme } from '../theme';
import SwipeRow from '../components/SwipeRow';

export { ImportCard } from './ImportContactsScreen';

function ContactRow({ c, onMenu }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Avatar name={c.name || c.phone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T bold numberOfLines={1}>
          {c.name || t('contacts.noName')}
        </T>
        <T tone="muted" style={{ fontSize: 13 }} numberOfLines={1}>
          {c.phone} · {c.groupName}
        </T>
        <View style={{ marginTop: 4 }}>
          {c.optedOut ? (
            <Tag label={t('contacts.optedOut')} tone="danger" />
          ) : (
            <Tag label={t('contacts.consent')} tone="success" />
          )}
        </View>
      </View>
      <IconButton
        icon="ellipsis-horizontal"
        onPress={() => onMenu(c)}
        accessibilityLabel={t('contacts.actions', { name: c.name || c.phone })}
      />
    </View>
  );
}

export default function ContactsScreen({ navigation }) {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(
    async (p = 1) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (q.trim()) params.set('q', q.trim());
        if (group) params.set('group', group);
        const r = await api(`/contacts?${params}`);
        if (id !== reqId.current) return;
        setItems((prev) => (p === 1 ? r.items : prev.concat(r.items)));
        setPage(p);
        setHasMore(r.hasMore);
        setTotal(r.total);
        setError(null);
        setLoadedOnce(true);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [q, group],
  );

  const loadGroups = useCallback(
    () =>
      api('/groups')
        .then((r) => setGroups(r.items))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    const tm = setTimeout(() => load(1), 300);
    return () => clearTimeout(tm);
  }, [load]);

  // Refresh when coming back (e.g. after an import).
  useFocusEffect(
    useCallback(() => {
      loadGroups();
      if (loadedOnce) load(1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadGroups]),
  );

  async function remove() {
    const c = confirmFor;
    setDeleting(true);
    try {
      await api(`/contacts/${c.id}`, { method: 'DELETE' });
      setItems((xs) => xs.filter((x) => x.id !== c.id));
      setTotal((n) => n - 1);
      loadGroups();
      toast.show(t('contacts.deleted'));
    } catch (e) {
      toast.show(errorMessage(e), 'danger');
    } finally {
      setDeleting(false);
      setConfirmFor(null);
    }
  }

  const noContactsAtAll = loadedOnce && !q && !group && total === 0;

  const header = (head) => (
    <View>
      {head}
      <Button
        title={t('contacts.import')}
        icon="add"
        onPress={() => navigation.navigate('ImportContacts')}
        style={{ marginBottom: 14 }}
        testID="open-import"
      />
      {!noContactsAtAll ? (
        <>
          <Field
            value={q}
            onChangeText={setQ}
            placeholder={t('contacts.search')}
            accessibilityLabel={t('contacts.search')}
            autoCapitalize="none"
          />
          <View style={{ height: 10 }} />
          <SegmentedTabs
            value={group}
            onChange={setGroup}
            options={[
              { value: '', label: t('contacts.all') },
              ...groups.map((g) => ({ value: g.id, label: `${g.name} (${g.count})` })),
            ]}
          />
          <ErrorText>{error}</ErrorText>
          <T tone="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {t('contacts.count', { n: total.toLocaleString() })}
          </T>
        </>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      {() => (
        <>
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={header(
              <ScreenHeader title={t('contacts.title')} sub={t('contacts.sub')} />,
            )}
            onEndReached={() => hasMore && !loading && load(page + 1)}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              loading && !loadedOnce ? (
                <View style={{ gap: 12 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Skeleton height={40} width={40} radius={20} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Skeleton height={14} width="60%" />
                        <Skeleton height={12} width="40%" />
                      </View>
                    </View>
                  ))}
                </View>
              ) : noContactsAtAll ? (
                <EmptyState
                  icon="people-outline"
                  title={t('contacts.empty')}
                  message={t('contacts.emptySub')}
                />
              ) : (
                <T tone="muted" style={{ paddingVertical: 12 }}>
                  {t('contacts.noMatch')}
                </T>
              )
            }
            renderItem={({ item, index }) => (
              <View
                style={{
                  borderTopLeftRadius: index === 0 ? 12 : 0,
                  borderTopRightRadius: index === 0 ? 12 : 0,
                  borderBottomLeftRadius: index === items.length - 1 ? 12 : 0,
                  borderBottomRightRadius: index === items.length - 1 ? 12 : 0,
                  overflow: 'hidden',
                }}
              >
                <SwipeRow onDelete={() => setConfirmFor(item)} deleteLabel={t('common.delete')}>
                  <ContactRow c={item} onMenu={setMenuFor} />
                </SwipeRow>
              </View>
            )}
            ListFooterComponent={
              loading && loadedOnce && items.length ? (
                <Skeleton height={14} width="40%" style={{ marginTop: 12 }} />
              ) : null
            }
          />
          <ActionMenu
            visible={!!menuFor}
            onClose={() => setMenuFor(null)}
            title={menuFor?.name || menuFor?.phone}
            actions={[
              {
                label: t('contacts.delete'),
                icon: 'trash-outline',
                tone: 'danger',
                onPress: () => setConfirmFor(menuFor),
              },
            ]}
          />
          <ConfirmSheet
            visible={!!confirmFor}
            title={t('contacts.deleteConfirm')}
            message={t('contacts.deleteMsg', {
              name: confirmFor?.name || confirmFor?.phone,
              group: confirmFor?.groupName,
            })}
            confirmLabel={t('common.delete')}
            onConfirm={remove}
            onClose={() => setConfirmFor(null)}
            busy={deleting}
          />
        </>
      )}
    </Screen>
  );
}
