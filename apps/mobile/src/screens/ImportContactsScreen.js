import { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts';
import { CONSENT_SOURCES, DEFAULT_GROUP_NAME, classifyRows, parseImportText } from '@1call/shared';
import { api, errorMessage } from '../api/client';
import { appendFile } from '../utils/filePart';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Field,
  Screen,
  SegmentedTabs,
  Select,
  T,
} from '../components/ui';
import { useTheme } from '../theme';

const STATUS_TONE = { valid: 'success', duplicate: 'warning', invalid: 'danger' };

/** Paste / CSV-Excel file / phone contacts → server preview → commit. */
export function ImportCard({ onImported }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [method, setMethod] = useState('paste');
  const [text, setText] = useState('');
  const [groupName, setGroupName] = useState(DEFAULT_GROUP_NAME);
  const [file, setFile] = useState(null);
  const [phoneCount, setPhoneCount] = useState(0);
  const [preview, setPreview] = useState(null);
  const [consentSource, setConsentSource] = useState('web_form');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Instant client-side count (same normalisation rules as the server).
  const quick =
    method !== 'file' && text.trim() ? classifyRows(parseImportText(text)).counts : null;
  const source = method === 'phone' ? 'phone_contacts' : method;
  const canPreview = method === 'file' ? !!file : !!text.trim();

  function switchMethod(m) {
    setMethod(m);
    setPreview(null);
    setError(null);
    if (m === 'paste' && source === 'phone_contacts') setText('');
  }

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
      setError(t('import.errFileType'));
      return;
    }
    setFile(a);
    setPreview(null);
  }

  async function pickPhoneContacts() {
    setError(null);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setError(t('import.errPermission'));
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
      setError(t('import.errNoNumbers'));
      return;
    }
    setText(lines.join('\n'));
    setPhoneCount(lines.length);
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      let r;
      if (method === 'file') {
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
      const result = { imported: r.imported, groupName: preview.groupName, groupId: r.groupId };
      setPreview(null);
      setText('');
      setFile(null);
      setPhoneCount(0);
      setDeclared(false);
      onImported?.(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.counts.valid ?? 0;
  return (
    <Card testID="import-card">
      <SegmentedTabs
        value={method}
        onChange={switchMethod}
        options={[
          { value: 'paste', label: t('import.tabPaste') },
          { value: 'file', label: t('import.tabFile') },
          { value: 'phone', label: t('import.tabPhone') },
        ]}
      />

      {method === 'paste' ? (
        <>
          <Field
            label={t('import.pasteLabel')}
            value={text}
            onChangeText={(v) => {
              setText(v);
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
              {t('import.quick', { valid: quick.valid, invalid: quick.invalid })}
            </T>
          ) : null}
        </>
      ) : null}

      {method === 'file' ? (
        <View style={{ gap: 8 }}>
          <T tone="muted" style={{ fontSize: 14 }}>
            {t('import.fileHint')}
          </T>
          <Button
            title={file ? t('import.fileChosen', { name: file.name }) : t('import.chooseFile')}
            variant="secondary"
            icon="document-text-outline"
            onPress={pickFile}
          />
        </View>
      ) : null}

      {method === 'phone' ? (
        <View style={{ gap: 8 }}>
          <T tone="muted" style={{ fontSize: 14 }}>
            {t('import.phoneHint')}
          </T>
          <Button
            title={t('import.pickPhone')}
            variant="secondary"
            icon="people-outline"
            onPress={pickPhoneContacts}
          />
          {phoneCount ? (
            <T tone="success" style={{ fontSize: 14 }}>
              {t('import.phoneLoaded', { n: phoneCount })}
            </T>
          ) : null}
        </View>
      ) : null}

      <Field
        label={t('import.group')}
        value={groupName}
        onChangeText={(v) => {
          setGroupName(v);
          setPreview(null);
        }}
        testID="import-group"
      />
      <Button
        title={t('import.preview')}
        onPress={runPreview}
        loading={busy && !preview}
        disabled={!canPreview}
        style={{ marginTop: 14, alignSelf: 'flex-start' }}
        testID="import-preview"
      />
      <ErrorText>{error}</ErrorText>

      {preview ? (
        <View testID="import-preview-result" style={{ marginTop: 14 }}>
          <T>
            <T bold>{preview.counts.valid}</T> {t('import.valid')} ·{' '}
            <T bold tone="warning">
              {preview.counts.duplicate}
            </T>{' '}
            {t('import.duplicate')} ·{' '}
            <T bold tone="danger">
              {preview.counts.invalid}
            </T>{' '}
            {t('import.invalid')}
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
                <T tone={STATUS_TONE[r.status]} style={{ flex: 1, fontWeight: '600' }}>
                  {t(`import.st_${r.status}`)}
                </T>
              </View>
            ))}
            {preview.rows.length > 12 ? (
              <T tone="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t('import.more', { n: preview.rows.length - 12 })}
              </T>
            ) : null}
          </View>
          <Select
            label={t('import.consentLabel')}
            value={consentSource}
            onChange={setConsentSource}
            options={CONSENT_SOURCES.map((v) => ({ value: v, label: t(`consent.${v}`) }))}
            testID="consent-source"
          />
          <Checkbox
            checked={declared}
            onChange={setDeclared}
            label={t('import.declaration')}
            testID="import-declaration"
          />
          <Button
            title={t('import.add', { n: valid })}
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

export default function ImportContactsScreen({ navigation }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <Screen title={t('import.title')} sub={t('import.sub')} back>
      <ImportCard
        onImported={({ imported, groupName }) => {
          toast.show(t('import.done', { n: imported, group: groupName }));
          navigation.goBack();
        }}
      />
    </Screen>
  );
}
