'use client';

import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';

export function AdminTile({ href, icon, titleKey, descKey }: { href: string; icon: string; titleKey: string; descKey: string }) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      className="group card card-hover flex items-start gap-3 p-5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500/20 dark:text-brand-300">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block font-bold text-body">{t(titleKey)}</span>
        <span className="block text-sm text-muted">{t(descKey)}</span>
      </span>
    </Link>
  );
}
