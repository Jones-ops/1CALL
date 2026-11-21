// Lightweight translations: English (default) and Kiswahili.
//   const { t, lang, setLang } = useI18n();
//   t('contacts.count', { n: 12 })  ->  "12 contacts"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import en from './en';
import sw from './sw';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
];
const DICTS = { en, sw };
const KEY = '1call.language';

export function translate(lang, key, vars) {
  const s = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
}

const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key, vars) => translate('en', key, vars),
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    storage
      .getItemAsync(KEY)
      .then((v) => v && DICTS[v] && setLangState(v))
      .catch(() => {});
  }, []);

  const setLang = useCallback((code) => {
    if (!DICTS[code]) return;
    setLangState(code);
    storage.setItemAsync(KEY, code).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Dates like "13 Dec 2026" in the chosen language. */
export function formatDate(value, lang = 'en') {
  if (!value) return '';
  const d = new Date(value);
  try {
    return d.toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d.toDateString();
  }
}

export function formatTime(value, lang = 'en') {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString(lang === 'sw' ? 'sw-KE' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
