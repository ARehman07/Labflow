'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { PortalShell } from '@/components/portal/PortalShell';

export function PartnerNav({ labName, partnerName, children }: { labName: string; partnerName: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <PortalShell
      labName={labName}
      who={partnerName}
      links={[
        { href: '/partner', label: t('portal.b2b.bookings') },
        { href: '/partner/book', label: t('portal.b2b.book') },
        { href: '/partner/statement', label: t('portal.b2b.statement') },
      ]}
    >
      {children}
    </PortalShell>
  );
}
