'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * One-tap English ⇄ Urdu switch.
 * `compact` drops the border and label to match the icon controls beside it.
 */
export function LanguageToggle({
  tone = 'dark',
  compact = false,
}: { tone?: 'dark' | 'light'; compact?: boolean }) {
  const { t, toggle } = useI18n();

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label="Switch language"
        title={t('language.toggle')}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-strong"
      >
        <Icon name="globe" className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">{t('language.toggle')}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors',
        tone === 'dark'
          ? 'border border-white/25 text-white hover:bg-white/10'
          : 'border border-line text-muted hover:bg-surface-2',
      )}
      aria-label="Switch language"
    >
      <Icon name="globe" className="h-4 w-4" />
      {t('language.toggle')}
    </button>
  );
}
