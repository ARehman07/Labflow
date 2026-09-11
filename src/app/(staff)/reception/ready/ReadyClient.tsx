'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, HandHeart, MessageCircle, PackageCheck, Phone } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { whatsappLink } from '@/lib/whatsapp';
import { markReportDeliveredAction, type ReadyReportDTO } from '@/modules/lab/lab.actions';

/**
 * Reports the counter has to give out.
 *
 * Every test on these visits is released. Each row leaves the list the moment
 * the report is handed over or sent, so what remains is exactly who is still
 * owed a report — the question a receptionist is asked all day.
 */
export function ReadyClient({
  initial, labName, portalLink,
}: { initial: ReadyReportDTO[]; labName: string; portalLink: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function deliver(it: ReadyReportDTO, channel: 'PRINT' | 'WHATSAPP') {
    if (channel === 'WHATSAPP') {
      const link = it.mobile ? whatsappLink(it.mobile, t('ready.waMessage')
        .replace('{name}', it.patientName)
        .replace('{lab}', labName)
        .replace('{slip}', it.slipNo)
        .replace('{link}', portalLink)) : null;
      if (!link) { toast('error', t('ready.noMobile')); return; }
      window.open(link, '_blank', 'noopener');
    }
    setBusy(`${it.visitId}:${channel}`);
    const res = await markReportDeliveredAction(it.visitId, channel);
    setBusy(null);
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.visitId !== it.visitId));
      toast('success', t('ready.done').replace('{name}', it.patientName));
    } else toast('error', res.error);
  }

  return (
    <div className="page">
      <PageHeader title={t('ready.title')} subtitle={t('ready.subtitle')} />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-ok-text">
            <PackageCheck className="h-7 w-7" />
          </span>
          <p className="font-semibold text-strong">{t('ready.none')}</p>
        </Card>
      ) : (
        <ul className="stagger space-y-3">
          {items.map((it) => (
            <li key={it.visitId}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/12 text-sm font-bold text-brand-600 dark:text-brand-300">
                  {it.patientName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-strong">{it.patientName}</span>
                    {it.printed && <Badge tone="info" size="sm">{t('report.printed')}</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="font-mono">{it.mrNo}</span>
                    <span>· #{it.slipNo}</span>
                    {it.mobile && (
                      <a href={`tel:${it.mobile}`} className="inline-flex items-center gap-1 font-mono text-brand-600 hover:underline dark:text-brand-300">
                        · <Phone className="h-3 w-3" /> {it.mobile}
                      </a>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-subtle">{it.tests.join(' · ')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/lab/report/${it.visitId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    <FileText className="h-4 w-4" /> {t('patient.report')}
                  </Link>
                  {it.mobile && (
                    <Button variant="outline" size="sm" onClick={() => deliver(it, 'WHATSAPP')}
                      loading={busy === `${it.visitId}:WHATSAPP`} disabled={busy !== null}>
                      <MessageCircle className="h-4 w-4" /> {t('report.whatsapp')}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => deliver(it, 'PRINT')}
                    loading={busy === `${it.visitId}:PRINT`} disabled={busy !== null}>
                    <HandHeart className="h-4 w-4" /> {t('report.markHanded')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
