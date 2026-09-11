'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Tv, Ticket, Megaphone, MonitorPlay, Droplet, ChevronRight, X, Info } from 'lucide-react';
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
  // Patients booked on an earlier day who still need a sample. They cannot be
  // in today's queue (numbers restart daily), so they are pointed to instead.
  const [earlier, setEarlier] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false); // in-flight guard — prevents double-advance from duplicate clicks

  const HOW_KEY = 'labflow.queue.howHidden';
  const [showHow, setShowHow] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(HOW_KEY) === '1') setShowHow(false); } catch { /* storage blocked */ }
  }, []);
  const setHow = (show: boolean) => {
    setShowHow(show);
    try { show ? localStorage.removeItem(HOW_KEY) : localStorage.setItem(HOW_KEY, '1'); } catch { /* storage blocked */ }
  };

  const load = useCallback(() => {
    getQueueAction()
      .then((r) => { setTokens(r.tokens); setNowServing(r.nowServing); setEarlier(r.earlierAwaitingCollection); })
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
  // Tokens arrive in number order, so the first one waiting is the one "Call next" will call.
  const nextToken = tokens.find((tk) => tk.status === 'WAITING') ?? null;
  const servingName = tokens.find((tk) => tk.status === 'CALLED' && tk.number === nowServing)?.patientName ?? null;
  // Everyone served means nobody waiting AND nobody still at the chair.
  const allDone = tokens.length > 0 && waiting === 0 && nowServing == null;

  return (
    <div className="page">
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

      {/* How it works — useful the first few times, then just in the way. Once
          hidden it stays hidden in this browser, and can be brought back. */}
      {showHow ? (
      <Card className="bg-brand-500/[0.06] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">{t('queue.howTitle')}</span>
          <button
            type="button"
            onClick={() => setHow(false)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-strong"
          >
            <X className="h-3.5 w-3.5" /> {t('queue.hideHow')}
          </button>
        </div>
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
      ) : (
        <button
          type="button"
          onClick={() => setHow(true)}
          className="-mt-2 inline-flex items-center gap-1.5 self-start text-xs font-semibold text-muted hover:text-strong"
        >
          <Info className="h-3.5 w-3.5" /> {t('queue.howTitle')}
        </button>
      )}

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
              <div className="mt-1.5 max-w-32 truncate text-xs font-medium text-white/60">{servingName ?? '\u00a0'}</div>
            </div>
            <div className="w-px self-stretch bg-white/10" />
            {/* The next token's NUMBER, not how many are waiting. A count drawn
                at the size of a token read as a token: "2 | 1" was taken to
                mean #1 was up next, when #1 had just been served and #4 was. */}
            <div className="min-w-24 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-subtle">
                {t('queue.upNext')}
              </div>
              <div className="mt-1 text-6xl font-black leading-none text-brand-400">
                {nextToken ? nextToken.number : <span className="text-white/25">—</span>}
              </div>
              <div className="mt-1.5 text-xs font-medium text-white/60">
                {waiting === 0 ? t('queue.noneWaiting') : t('queue.waitingN').replace('{n}', String(waiting))}
              </div>
            </div>
          </div>
          {canManage && (
            <div className="text-center sm:text-end">
              <Button size="lg" onClick={callNext} disabled={waiting === 0 || isPending} loading={isPending} className="min-w-44">
                <Megaphone className="h-5 w-5" /> {t('queue.callNext')}
              </Button>
              <p className="mt-1.5 text-[11px] text-subtle">
                {allDone ? t('queue.allServed') : nowServing == null ? t('queue.nobody') : waiting === 0 ? t('queue.lastOne') : t('queue.callNextHint')}
              </p>
            </div>
          )}
        </div>
      </Card>

      {earlier > 0 && (
        <Link
          href="/lab?stage=COLLECT"
          className="group flex items-center gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-warn-text transition-opacity hover:opacity-90"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warn-text/10">
            <Droplet className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {earlier === 1
                ? t('queue.earlierOne')
                : t('queue.earlierMany').replace('{n}', String(earlier))}
            </span>
            <span className="block text-xs opacity-80">{t('queue.earlierHint')}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            {t('queue.openCollect')}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </span>
        </Link>
      )}

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
