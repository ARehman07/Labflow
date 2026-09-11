'use client';

import { useI18n } from '@/core/i18n/I18nProvider';
import { PortalShell } from '@/components/portal/PortalShell';

export function DoctorNav({ labName, doctorName, children }: { labName: string; doctorName: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <PortalShell labName={labName} who={doctorName} links={[{ href: '/doctor', label: t('portal.doctor.patients') }]}>
      {children}
    </PortalShell>
  );
}
