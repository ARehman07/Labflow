'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Tv, Ticket, Megaphone, MonitorPlay } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { QUEUE_STATUS } from '@/lib/status';
import { getQueueAction, callNextAction, markTokenDoneAction, type QueueTokenRow } from '@/modules/queue/queue.actions';

export function QueueClient({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<QueueTokenRow[]>([]);
  const [nowServing, setNowServing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false); // in-flight guard — prevents double-advance from duplicate clicks

  const load = useCallback(() => {
    getQueueAction()
      .then((r) => { setTokens(r.tokens); setNowServing(r.nowServing); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const callNext = () => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try { await callNextAction(); load(); } finally { busy.current = false; }
    });
  };
  const markDone = (id: string) => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try { await markTokenDoneAction(id); load(); } finally { busy.current = false; }
    });
  };

  const waiting = tokens.filter((tk) => tk.status === 'WAITING').length;
  const allDone = tokens.length > 0 && waiting === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('queue.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">{t('queue.subtitle')}</p>
        </div>
        <Link href="/queue-display" target="_blank">
          <Button variant="outline" className="flex-col items-start gap-0 !px-4 !py-2">
            <span className="flex items-center gap-2 font-semibold"><Tv className="h-4 w-4" /> {t('queue.openDisplay')}</span>
            <span className="text-[11px] font-normal text-subtle">{t('queue.displayHint')}</span>
          </Button>
        </Link>
      </div>

      {/* How it works */}
      <Card className="bg-brand-500/[0.06] p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">{t('queue.howTitle')}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Ticket, text: t('queue.how1') },
            { icon: Megaphone, text: t('queue.how2') },
            { icon: MonitorPlay, text: t('queue.how3') },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-600 ring-1 ring-brand-500/20 dark:text-brand-300">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-xs leading-snug text-muted">{s.text}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Serving control */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col items-center gap-5 bg-ink p-6 text-white sm:flex-row sm:justify-between">
          {/*
            Both figures carry their label ABOVE them. They used to be mirrored
            — "NOW SERVING" over its number, the waiting count over ITS label —
            so with nobody being served the eye paired "NOW SERVING" with the
            large waiting figure and read it as the token being called.
          */}
          <div className="flex items-stretch gap-5">
            <div className="min-w-24 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-subtle">
                {t('queue.nowServing')}
              </div>
              <div className="mt-1 text-6xl font-black leading-none text-white">
                {nowServing ?? <span className="text-white/25">—</span>}
              </div>
            </div>
            <div className="w-px self-stretch bg-white/10" />
            <div className="min-w-24 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-subtle">
                {t('queue.waitingCount')}
              </div>
              <div className="mt-1 text-6xl font-black leading-none text-brand-400">{waiting}</div>
            </div>
          </div>
          {canManage && (
            <div className="text-center sm:text-end">
              <Button size="lg" onClick={callNext} disabled={waiting === 0 || isPending} loading={isPending} className="min-w-44">
                <Megaphone className="h-5 w-5" /> {t('queue.callNext')}
              </Button>
              <p className="mt-1.5 text-[11px] text-subtle">
                {allDone ? t('queue.allServed') : nowServing == null ? t('queue.nobody') : t('queue.callNextHint')}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Token list */}
      <div>
        <div className="section-title mb-2">{t('queue.tokensToday')}</div>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-[11px] font-bold uppercase tracking-wider text-subtle">
                <th className="px-5 py-2.5 text-start font-semibold">{t('queue.token')}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t('queue.patient')}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t('queue.status')}</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-subtle">{t('common.loading')}</td></tr>
              ) : tokens.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-subtle">{t('queue.empty')}</td></tr>
              ) : (
                tokens.map((tk) => (
                  <tr key={tk.id} className={cn('transition-colors odd:bg-surface-2/40 hover:bg-surface-2', tk.status === 'CALLED' && 'bg-brand-500/10')}>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black',
                        tk.status === 'CALLED' ? 'bg-brand-600 text-white' : tk.status === 'DONE' ? 'bg-surface-3 text-subtle' : 'bg-surface-3 text-body')}>
                        {tk.number}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-body">{tk.patientName}</td>
                    <td className="px-4 py-3">
                      <Badge tone={QUEUE_STATUS[tk.status]?.tone ?? 'neutral'}>{t(`queue.${tk.status}`)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-end">
                      {canManage && tk.status !== 'DONE' && (
                        <Button size="sm" variant="ghost" onClick={() => markDone(tk.id)}>{t('queue.markDone')}</Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
