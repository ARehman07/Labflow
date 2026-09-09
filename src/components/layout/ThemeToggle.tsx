'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/core/theme/ThemeProvider';
import { useI18n } from '@/core/i18n/I18nProvider';

/**
 * A plain light ⇄ dark switch.
 *
 * The provider still starts from the device preference on a first visit, so
 * nobody gets a white screen at night before touching anything — but once a
 * choice is made it is explicit, and this button only ever flips between the
 * two real states.
 */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const { t } = useI18n();

  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={t(`theme.${next}`)}
      title={t(`theme.${next}`)}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-strong"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
