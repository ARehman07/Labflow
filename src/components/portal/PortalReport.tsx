'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileDown, History, Printer } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button, buttonVariants } from '@/components/ui/Button';
import { ReportDocument } from '@/components/report/ReportDocument';
import { exportReport, reportFileName } from '@/lib/report-export';
import type { ReportData } from '@/modules/reporting/report.types';

/** A released report for a partner lab or doctor: history on request, print or save as PDF. */
export function PortalReport({ data, back }: { data: ReportData; back: string }) {
  const { t } = useI18n();
  const [history, setHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  async function pdf() {
    const el = box.current?.querySelector<HTMLElement>('.report-sheet');
    if (!el) return;
    setSaving(true);
    try { await exportReport(el, reportFileName(data.slipNo, data.mrNo), 'pdf'); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={back} className={buttonVariants({ variant: 'ghost' })}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('portal.back')}</Link>
        <span className="flex-1" />
        {data.hasHistory && (
          <Button variant={history ? 'primary' : 'outline'} size="sm" aria-pressed={history} onClick={() => setHistory((v) => !v)}>
            <History className="h-3.5 w-3.5" /> {t('report.withHistory')}
          </Button>
        )}
        <Button variant="outline" size="sm" loading={saving} onClick={pdf}><FileDown className="h-3.5 w-3.5" /> {t('report.downloadPdf')}</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> {t('report.print')}</Button>
      </div>
      <div ref={box}><ReportDocument data={data} showActions={false} withHistory={history} /></div>
    </div>
  );
}
