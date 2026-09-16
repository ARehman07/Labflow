'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import en from './messages/en.json';
import { MESSAGE_PATTERNS } from './patterns';

export type Locale = 'en' | 'ur';
type Messages = Record<string, string>;

const EN = en as Messages;

/**
 * The words on screen.
 *
 * Urdu is around 127 KB of JSON, and importing it here put it in the first load
 * of every page for every reader, English ones included. It is fetched the
 * first time someone actually reads in Urdu; until it arrives English shows,
 * which is the same fallback a missing key always had.
 */
function useDictionary(locale: Locale): Messages {
  const [urdu, setUrdu] = useState<Messages | null>(null);
  useEffect(() => {
    if (locale !== 'ur' || urdu) return;
    let alive = true;
    void import('./messages/ur.json').then((m) => { if (alive) setUrdu(m.default as Messages); });
    return () => { alive = false; };
  }, [locale, urdu]);
  return locale === 'ur' && urdu ? urdu : EN;
}

/** English sentence → key, so a message that arrives as text can still be translated. */
const EN_INDEX = new Map(Object.entries(en as Messages).map(([k, v]) => [v, k]));

interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
  /**
   * Translate a message that arrived as English text — an error from the
   * server, which does not know which language the person is reading in.
   * Unknown text is returned unchanged rather than dropped.
   */
  tr: (message: string) => string;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const COOKIE = 'labflow_locale';

/** English-first i18n. Locale persists in a cookie; Urdu switches to RTL.
 *  Lightweight by design for Phase 0; can migrate to next-intl later. */
export function I18nProvider({
  initialLocale = 'en',
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dict = useDictionary(locale);
  const dir = locale === 'ur' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const toggle = useCallback(
    () => setLocale(locale === 'en' ? 'ur' : 'en'),
    [locale, setLocale],
  );

  const t = useCallback(
    (key: string) => dict[key] ?? EN[key] ?? key,
    [dict],
  );

  const tr = useCallback(
    (message: string) => {
      if (!message || locale === 'en') return message;
      const key = EN_INDEX.get(message);
      if (key) return dict[key] ?? message;
      for (const p of MESSAGE_PATTERNS) {
        const m = message.match(p.re);
        if (!m) continue;
        let out = dict[p.key];
        if (!out) return message;
        p.vars.forEach((v, i) => { out = out.replace(`{${v}}`, m[i + 1]); });
        return out;
      }
      return message;
    },
    [dict, locale],
  );

  return (
    <I18nContext.Provider value={{ locale, dir, t, tr, setLocale, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
