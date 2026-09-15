'use client';

import Link from 'next/link';
import { Tag } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { QrCode } from '@/components/ui/QrCode';
import { Barcode } from '@/components/ui/Barcode';
import { cn } from '@/lib/utils';

export interface LabelData {
  visitId: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  samples: { id: string; barcode: string; specimenType: string; collectedAt: string | null; tests: string[] }[];
}

/**
 * One label per tube, printed at the counter straight after booking.
 *
 * The tube is labelled before the sample goes in: a tube that reaches the chair
 * unlabelled is the classic way a sample ends up against the wrong patient. The
 * name is what a person checks by eye, so it gets the full width of the label
 * and wraps to a second line rather than being cut short.
 */
export function LabelsClient({ data }: { data: LabelData }) {
  const { t } = useI18n();
  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const longName = data.patientName.length > 22;

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          title={t('labels.title')}
          subtitle={`${data.patientName} · ${data.mrNo} · #${data.slipNo}`}
          back={{ href: `/reception/${data.visitId}`, label: t('slip.title') }}
          actions={
            <>
              <Link href="/lab" className={buttonVariants({ variant: 'outline' })}>{t('lab.title')}</Link>
              {data.samples.length > 0 && <PrintButton variant="primary" label={t('labels.print')} />}
            </>
          }
        />
        <p className="mt-2 text-sm text-muted">{t('labels.subtitle')}</p>
      </div>

      {data.samples.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
            <Tag className="h-6 w-6" />
          </span>
          <p className="text-muted">{t('labels.none')}</p>
        </Card>
      ) : (
        <div className="print-area grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
          {data.samples.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-1.5 rounded-lg border border-line-strong bg-white p-2.5 text-slate-900 print:break-inside-avoid print:rounded-none print:border-slate-400"
            >
              {/* The name first and full width — wraps to two lines, never truncated. */}
              <div className={cn('break-words font-extrabold uppercase leading-tight [overflow-wrap:anywhere]', longName ? 'text-[12px]' : 'text-[14px]')}>
                {data.patientName}
              </div>
              <div className="text-[11px] leading-tight text-slate-700">
                {data.mrNo}
                {data.age != null && ` · ${data.age}${t('common.years')}`}
                {data.sex && ` · ${data.sex.charAt(0)}`}
                {` · #${data.slipNo}`}
              </div>

              {/* Code 128 for bench and analyzer scanners; a small QR for phones. */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Barcode value={s.barcode} height={26} width={128} />
                  <div className="font-mono text-[10px] tracking-wide">{s.barcode}</div>
                </div>
                <QrCode value={s.barcode} size={44} />
              </div>

              <div className="text-[11px] leading-tight">
                <span className="font-bold">{t(`specimen.${s.specimenType}`)}</span>
                <span className="text-slate-700"> · {s.tests.join(', ')}</span>
              </div>
              {s.collectedAt && (
                <div className="text-[9px] text-slate-500">{t('labels.collected').replace('{time}', time(s.collectedAt))}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
