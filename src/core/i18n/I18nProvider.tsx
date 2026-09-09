'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import en from './messages/en.json';
import ur from './messages/ur.json';

export type Locale = 'en' | 'ur';
type Messages = Record<string, string>;

const DICTS: Record<Locale, Messages> = { en, ur };

interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
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
    (key: string) => DICTS[locale][key] ?? DICTS.en[key] ?? key,
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, dir, t, setLocale, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
