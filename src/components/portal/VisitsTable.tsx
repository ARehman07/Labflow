'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { PortalVisitDTO } from '@/modules/partners/portal.actions';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Bookings with each test's status as a tag, and the report once anything is released. */
export function VisitsTable({ visits, reportBase }: { visits: PortalVisitDTO[]; reportBase: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? visits.filter((v) => `${v.patient} ${v.mrNo} ${v.slipNo} ${v.b2bNo ?? ''}`.toLowerCase().includes(s)) : visits;
  }, [visits, q]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('portal.b2b.search')} aria-label={t('portal.b2b.search')} className="field ps-10" />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">{t('partners.date')}</th>
              <th className="px-4 py-2.5 text-start">{t('partners.patient')}</th>
              <th className="px-4 py-2.5 text-start">{t('partners.tests')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">{t('partners.noBookings')}</td></tr>}
            {shown.map((v) => (
              <tr key={v.id} className="border-b border-line/70 align-top">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <div className="tabular-nums">{shortDate(v.bookedAt)}</div>
                  <div className="font-mono text-xs text-subtle">#{v.slipNo}{v.b2bNo && ` · ${v.b2bNo}`}</div>
                </td>
                <td className="px-4 py-2.5"><div className="font-medium text-body">{v.patient}</div><div className="text-xs text-subtle">{v.mrNo}</div></td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {v.tests.map((x, i) => (
                      <Badge key={i} tone={RELEASED.includes(x.status) ? 'success' : x.status === 'RETAKE' ? 'warning' : 'neutral'} size="sm" title={t(`status.${x.status}`)}>
                        {x.name} · {t(`status.${x.status}`)}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-end">
                  {v.released ? (
                    <Link href={`${reportBase}/${v.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                      <FileText className="h-4 w-4" /> {v.allReleased ? t('portal.b2b.report') : t('portal.b2b.partReport')}
                    </Link>
                  ) : <span className="text-xs text-subtle">{t('portal.b2b.inProgress')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
