import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts';
import {
  CONSENT_SOURCES,
  CONSENT_SOURCE_LABELS,
  DEFAULT_GROUP_NAME,
  classifyRows,
  parseImportText,
} from '@1call/shared';
import { api, errorMessage } from '../api/client';
import { appendFile } from '../utils/filePart';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Field,
  H2,
  Loading,
  Row,
  Screen,
  ScreenHeader,
  Select,
  T,
  Tag,
} from '../components/ui';
import { useTheme } from '../theme';

const STATUS = {
  valid: ['Valid', 'success'],
  duplicate: ['Duplicate', 'warning'],
  invalid: ['Invalid', 'danger'],
};

/** Import card: paste / CSV-Excel file / phone contacts → server preview → commit. */
export function ImportCard({ onImported }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [groupName, setGroupName] = useState(DEFAULT_GROUP_NAME);
  const [file, setFile] = useState(null);
  const [source, setSource] = useState('paste');
  const [preview, setPreview] = useState(null);
  const [consentSource, setConsentSource] = useState('web_form');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  // Instant client-side count (same normalisation rules as the server).
  const quick = text.trim() ? classifyRows(parseImportText(text)).counts : null;

  async function pickFile() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        '*/*',
      ],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (!/\.(csv|xlsx|txt)$/i.test(a.name)) {
      setError('Choose a .csv or .xlsx file.');
      return;
    }
    setFile(a);
    setSource('file');
    setPreview(null);
  }

  async function pickPhoneContacts() {
    setError(null);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setError('Contacts permission was denied. You can still paste numbers or choose a file.');
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });
    const lines = [];
    data.forEach((c) =>
      (c.phoneNumbers || []).forEach((p) =>
        lines.push(`${(c.name || '').replace(/[,;\t]/g, ' ')},${p.number}`),
      ),
    );
    if (!lines.length) {
      setError('No phone numbers found in your contacts.');
      return;
    }
    setText(lines.join('\n'));
    setFile(null);
    setSource('phone_contacts');
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      let r;
      if (file) {
        const form = new FormData();
        form.append('groupName', groupName);
        await appendFile(form, 'file', { uri: file.uri, name: file.name, webFile: file.file });
        r = await api('/contacts/import/preview', { method: 'POST', form });
      } else {
        r = await api('/contacts/import/preview', { method: 'POST', body: { text, groupName } });
      }
      setPreview(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const rows = preview.rows
        .filter((x) => x.status === 'valid')
        .map((x) => ({ name: x.name, phone: x.phone }));
      const r = await api('/contacts/import/commit', {
        method: 'POST',
        body: {
          groupName: preview.groupName,
          consentSource,
          declarationAccepted: true,
          source,
          rows,
        },
      });
      setDone(`${r.imported} contacts added to “${preview.groupName}”.`);
      setPreview(null);
      setText('');
      setFile(null);
      setDeclared(false);
      onImported?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.counts.valid ?? 0;
  return (
    <Card testID="import-card">
      <H2>Import contacts</H2>
      <Field
        label="Paste numbers (one per line, optional “name,number”)"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setFile(null);
          if (source === 'file') setSource('paste');
          setPreview(null);
        }}
        multiline
        numberOfLines={4}
        placeholder={'Jane Wanjiru,0712345678\n+254733111222\n0100123456'}
        testID="import-text"
        autoCapitalize="none"
      />
      {quick ? (
        <T tone="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {quick.valid} look valid · {quick.invalid} invalid (checked again on preview)
        </T>
      ) : null}
      <Row style={{ marginTop: 10 }}>
        <Button
          title={file ? `File: ${file.name}` : 'Choose CSV or Excel file'}
          variant="secondary"
          icon="document-text-outline"
          onPress={pickFile}
          style={{ flexGrow: 1 }}
        />
        <Button
          title="From phone contacts"
          variant="secondary"
          icon="people-outline"
          onPress={pickPhoneContacts}
          style={{ flexGrow: 1 }}
        />
      </Row>
      <Field
        label="Group name"
        value={groupName}
        onChangeText={(v) => {
          setGroupName(v);
          setPreview(null);
        }}
        testID="import-group"
      />
      <Button
        title="Preview import"
        onPress={runPreview}
        loading={busy && !preview}
        disabled={!text.trim() && !file}
        style={{ marginTop: 14, alignSelf: 'flex-start' }}
        testID="import-preview"
      />
      <ErrorText>{error}</ErrorText>
      {done ? (
        <T tone="success" style={{ marginTop: 10 }}>
          {done}
        </T>
      ) : null}

      {preview ? (
        <View testID="import-preview-result" style={{ marginTop: 14 }}>
          <T>
            <T bold>{preview.counts.valid}</T> valid ·{' '}
            <T bold tone="warning">
              {preview.counts.duplicate}
            </T>{' '}
            duplicate ·{' '}
            <T bold tone="danger">
              {preview.counts.invalid}
            </T>{' '}
            invalid
          </T>
          <View style={{ marginTop: 8 }}>
            {preview.rows.slice(0, 12).map((r) => (
              <View
                key={`${r.line}-${r.input}`}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  paddingVertical: 7,
                  gap: 8,
                }}
              >
                <T style={{ flex: 1.2 }} numberOfLines={1}>
                  {r.name || '—'}
                </T>
                <T style={{ flex: 1.4 }} numberOfLines={1}>
                  {r.phone || r.input}
                </T>
                <T tone={STATUS[r.status][1]} style={{ flex: 1, fontWeight: '600' }}>
                  {STATUS[r.status][0]}
                </T>
              </View>
            ))}
            {preview.rows.length > 12 ? (
              <T tone="muted" style={{ fontSize: 13, marginTop: 4 }}>
                …and {preview.rows.length - 12} more rows
              </T>
            ) : null}
          </View>
          <Select
            label="Where did consent come from?"
            value={consentSource}
            onChange={setConsentSource}
            options={CONSENT_SOURCES.map((v) => ({
              value: v,
              label: `${CONSENT_SOURCE_LABELS[v]} (${v})`,
            }))}
            testID="consent-source"
          />
          <Checkbox
            checked={declared}
            onChange={setDeclared}
            label="I confirm these people agreed to receive voice calls from me and I may contact them."
            testID="import-declaration"
          />
          <Button
            title={`Add ${valid} contacts`}
            onPress={commit}
            loading={busy}
            disabled={!valid || !declared}
            testID="import-commit"
          />
        </View>
      ) : null}
    </Card>
  );
}

export default function ContactsScreen() {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
    const t = setTimeout(() => load(1), 300);
    return () => clearTimeout(t);
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [loadGroups]),
  );

  function remove(c) {
    Alert.alert('Delete contact?', `${c.name || c.phone} will be removed from “${c.groupName}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/contacts/${c.id}`, { method: 'DELETE' });
            setItems((xs) => xs.filter((x) => x.id !== c.id));
            setTotal((t) => t - 1);
            loadGroups();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);
  }

  const header = (head) => (
    <View>
      {head}
      <ImportCard
        onImported={() => {
          load(1);
          loadGroups();
        }}
      />
      <Card style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <H2>All contacts</H2>
        <Field
          value={q}
          onChangeText={setQ}
          placeholder="Search name or number"
          accessibilityLabel="Search name or number"
          autoCapitalize="none"
        />
        <View style={{ height: 8 }} />
        <Select
          value={group}
          onChange={setGroup}
          options={[
            { value: '', label: 'All groups' },
            ...groups.map((g) => ({ value: g.id, label: `${g.name} (${g.count})` })),
          ]}
          label="Group"
        />
        <ErrorText>{error}</ErrorText>
        <T tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {total.toLocaleString()} contacts
        </T>
      </Card>
    </View>
  );

  return (
    <Screen scroll={false}>
      {() => (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header(
            <ScreenHeader
              title="Contacts"
              sub="Only upload people you are authorised to contact. Consent is recorded for every import."
            />,
          )}
          onEndReached={() => hasMore && !loading && load(page + 1)}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <View
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderTopWidth: 0,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                padding: 12,
              }}
            >
              {loading ? (
                <Loading />
              ) : !items.length ? (
                <T tone="muted">No contacts found.</T>
              ) : null}
            </View>
          }
          renderItem={({ item: c }) => (
            <View
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T bold numberOfLines={1}>
                    {c.name || 'No name'}
                  </T>
                  <T tone="muted" style={{ fontSize: 13 }}>
                    {c.phone} · {c.groupName}
                  </T>
                  <View style={{ marginTop: 4 }}>
                    {c.optedOut ? (
                      <Tag label="Opted out" tone="danger" />
                    ) : (
                      <Tag label="Consent on file" tone="success" />
                    )}
                  </View>
                </View>
                <Button
                  title="Delete"
                  variant="secondary"
                  onPress={() => remove(c)}
                  accessibilityLabel={`Delete ${c.name || c.phone}`}
                />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
