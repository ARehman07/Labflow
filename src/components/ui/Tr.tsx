'use client';

import { useI18n } from '@/core/i18n/I18nProvider';

/** A message from the server, shown in the reader's language when a translation is known. */
export function Tr({ text }: { text: string | null | undefined }) {
  const { tr } = useI18n();
  return <>{text ? tr(text) : null}</>;
}
