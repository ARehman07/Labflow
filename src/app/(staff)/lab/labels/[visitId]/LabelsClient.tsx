'use client';

import { Tag } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { QrCode } from '@/components/ui/QrCode';
import { Barcode } from '@/components/ui/Barcode';

export interface LabelData {
  slipNo: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  samples: { id: string; barcode: string; specimenType: string; collectedAt: string | null; tests: string[] }[];
}

/**
 * One label per tube, printed at the chair.
 *
 * A tube that leaves the phlebotomy chair unlabelled is the classic way a
 * sample ends up against the wrong patient. Each label carries a scannable
 * code of the tube's barcode plus the details a person checks by eye: name,
 * MR#, specimen and the tests it is for.
 */
export function LabelsClient({ data }: { data: LabelData }) {
  const { t } = useI18n();
  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          title={t('labels.title')}
          subtitle={`${data.patientName} · ${data.mrNo} · #${data.slipNo}`}
          back={{ href: '/lab', label: t('lab.title') }}
          actions={data.samples.length > 0 ? <PrintButton variant="primary" label={t('labels.print')} /> : undefined}
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
              className="flex items-center gap-3 rounded-lg border border-line-strong bg-white p-2.5 text-slate-900 print:break-inside-avoid print:rounded-none print:border-slate-400"
            >
              {/* QR for phones and the portal; Code 128 beneath for bench and analyzer scanners. */}
              <div className="flex shrink-0 flex-col items-center gap-1">
                <QrCode value={s.barcode} size={60} />
                <Barcode value={s.barcode} height={18} width={110} />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-extrabold uppercase">{data.patientName}</div>
                <div className="truncate text-[11px] text-slate-600">
                  {data.mrNo}
                  {data.age != null && ` · ${data.age}${t('common.years')}`}
                  {data.sex && ` · ${data.sex.charAt(0)}`}
                </div>
                <div className="mt-1 text-[11px] font-bold">
                  {t(`specimen.${s.specimenType}`)} · #{data.slipNo}
                </div>
                <div className="truncate text-[10px] text-slate-600">{s.tests.join(', ')}</div>
                <div className="mt-0.5 font-mono text-[10px] tracking-wide">{s.barcode}</div>
                {s.collectedAt && (
                  <div className="text-[9px] text-slate-500">{t('labels.collected').replace('{time}', time(s.collectedAt))}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
