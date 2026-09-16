'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoll } from '@/lib/use-poll';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Building2, CheckCheck, Clock, Cpu, RotateCcw, Undo2, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationDTO,
} from '@/modules/notifications/notifications.actions';

const ICON: Record<string, LucideIcon> = {
  CRITICAL: AlertTriangle, RETAKE: RotateCcw, SENT_BACK: Undo2, DELAYED: Clock, B2B_BOOKING: Building2, ANALYZER: Cpu,
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/**
 * What happened that this person can act on: a critical value, a sample that
 * needs taking again, a result sent back, a booking from a partner lab. The
 * bell shows how many are unread; each opens the screen where it is handled.
 */
export function NotificationBell() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    getNotificationsAction().then((r) => { setItems(r.items); setUnread(r.unread); }).catch(() => {});
  }, []);

  usePoll(load, 60_000);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const text = (raw: string) => {
    try {
      const m = JSON.parse(raw) as { key: string; params?: Record<string, string> };
      let s = t(m.key);
      for (const [k, v] of Object.entries(m.params ?? {})) s = s.replaceAll(`{${k}}`, v);
      return s;
    } catch {
      return raw;
    }
  };

  async function openItem(n: NotificationDTO) {
    if (!n.isRead) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationReadAction(n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={unread > 0 ? t('notify.bellUnread').replace('{n}', String(unread)) : t('notify.bell')}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-strong"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-dropdown animate-scale-in">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-strong">{t('notify.title')}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={async () => { await markAllNotificationsReadAction(); setItems((xs) => xs.map((x) => ({ ...x, isRead: true }))); setUnread(0); }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                <CheckCheck className="h-3.5 w-3.5" /> {t('notify.markAll')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{t('notify.none')}</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn('flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-start transition-colors hover:bg-surface-2', !n.isRead && 'bg-brand-500/[0.05]')}
                    >
                      <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                        n.kind === 'CRITICAL' ? 'bg-danger-soft text-danger-text' : 'bg-surface-3 text-muted')}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', n.isRead ? 'text-muted' : 'font-semibold text-body')}>{text(n.message)}</span>
                        <span className="text-[11px] text-subtle">{ago(n.at)}</span>
                      </span>
                      {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
