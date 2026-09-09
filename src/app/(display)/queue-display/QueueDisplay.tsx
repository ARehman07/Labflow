'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';
import { getQueueAction, type QueueTokenRow } from '@/modules/queue/queue.actions';

export function QueueDisplay() {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<QueueTokenRow[]>([]);
  const [nowServing, setNowServing] = useState<number | null>(null);

  useEffect(() => {
    const load = () => getQueueAction().then((r) => { setTokens(r.tokens); setNowServing(r.nowServing); }).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const waiting = tokens.filter((tk) => tk.status === 'WAITING').map((tk) => tk.number).slice(0, 12);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-800 via-brand-700 to-clinic-800 text-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-10 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <Icon name="flask" className="h-8 w-8" />
        </div>
        <div className="text-3xl font-extrabold tracking-tight">{t('app.name')}</div>
      </div>

      {/* Now serving */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-4 text-2xl font-semibold uppercase tracking-[0.3em] text-white/70">{t('queue.nowServing')}</div>
        <div className="animate-scale-in text-[14rem] font-black leading-none drop-shadow-lg" key={nowServing ?? 'none'}>
          {nowServing ?? '—'}
        </div>
      </div>

      {/* Waiting numbers */}
      <div className="bg-black/20 px-10 py-6">
        <div className="mb-3 text-lg font-semibold uppercase tracking-widest text-white/60">{t('queue.next')}</div>
        {waiting.length === 0 ? (
          <div className="text-xl text-white/50">{t('queue.pleaseWait')}</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {waiting.map((n) => (
              <span key={n} className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl font-bold ring-1 ring-white/20">
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
