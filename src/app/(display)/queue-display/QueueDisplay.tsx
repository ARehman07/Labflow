'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import en from '@/core/i18n/messages/en.json';
import ur from '@/core/i18n/messages/ur.json';
import { getDisplayIdentityAction, getQueueAction, type QueueTokenRow } from '@/modules/queue/queue.actions';

const MAX_SHOWN = 12;
const EN = en as Record<string, string>;
const UR = ur as Record<string, string>;

/** Both languages at once: a waiting room reads English and Urdu, and nobody there can change the setting. */
function Both({ k, className }: { k: string; className?: string }) {
  return (
    <span className={className}>
      <span>{EN[k] ?? k}</span>
      <span className="mx-3 opacity-40" aria-hidden>·</span>
      <span dir="rtl" lang="ur" className="font-[var(--font-urdu)]">{UR[k] ?? EN[k] ?? k}</span>
    </span>
  );
}

/**
 * The waiting-room TV.
 *
 * Seen from across a room by people who are not looking at it until their
 * number comes up, so it has to make that moment impossible to miss: a new
 * number flashes and chimes. It names the lab — not the software — and keeps a
 * clock, which is what people glance at while they wait. Sizes scale with the
 * screen, because it runs on whatever TV the lab owns.
 */
export function QueueDisplay() {
  const [tokens, setTokens] = useState<QueueTokenRow[]>([]);
  const [nowServing, setNowServing] = useState<number | null>(null);
  const [identity, setIdentity] = useState<{ labName: string; branchName: string | null }>({ labName: '', branchName: null });
  const [clock, setClock] = useState('');
  const [flash, setFlash] = useState(false);
  const last = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    getDisplayIdentityAction().then(setIdentity).catch(() => {});
    const load = () => getQueueAction().then((r) => { setTokens(r.tokens); setNowServing(r.nowServing); }).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // A newly called number: flash it and chime. Not on first load — a screen
  // switched on mid-morning should not chime for someone called an hour ago.
  useEffect(() => {
    if (last.current === undefined) { last.current = nowServing; return; }
    if (nowServing != null && nowServing !== last.current) {
      setFlash(true);
      const off = setTimeout(() => setFlash(false), 2400);
      chime();
      last.current = nowServing;
      return () => clearTimeout(off);
    }
    last.current = nowServing;
  }, [nowServing]);

  const waitingAll = tokens.filter((tk) => tk.status === 'WAITING').map((tk) => tk.number);
  const waiting = waitingAll.slice(0, MAX_SHOWN);
  const more = waitingAll.length - waiting.length;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-700 to-clinic-700 text-white">
      <header className="flex items-center justify-between gap-6 px-[4vw] py-[3vh]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-[clamp(3rem,6vh,4.5rem)] w-[clamp(3rem,6vh,4.5rem)] shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Icon name="flask" className="h-1/2 w-1/2" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[clamp(1.5rem,3.2vw,3rem)] font-extrabold uppercase tracking-tight">{identity.labName}</div>
            {identity.branchName && <div className="truncate text-[clamp(0.9rem,1.4vw,1.4rem)] text-white/70">{identity.branchName}</div>}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[clamp(2rem,4.5vw,4.5rem)] font-bold tabular-nums text-white/90">{clock}</div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {nowServing != null ? (
          <>
            <Both k="queue.nowServing" className="mb-[2vh] block text-[clamp(1.1rem,2.2vw,2.2rem)] font-semibold uppercase tracking-[0.2em] text-white/75" />
            <div
              key={nowServing}
              className={`animate-scale-in rounded-[3vw] px-[4vw] text-[clamp(8rem,28vh,22rem)] font-black leading-none drop-shadow-lg transition-colors duration-500 ${flash ? 'bg-white text-brand-800' : ''}`}
              aria-live="assertive"
            >
              {nowServing}
            </div>
          </>
        ) : (
          // Nobody called yet. A giant dash at this size reads as a white bar,
          // so the room is simply told to wait.
          <Both k="queue.pleaseWait" className="block text-[clamp(1.6rem,3.6vw,3.6rem)] font-semibold text-white/80" />
        )}
      </main>

      <footer className="bg-black/20 px-[4vw] py-[3vh]">
        <Both k="queue.next" className="mb-3 block text-[clamp(0.9rem,1.5vw,1.5rem)] font-semibold uppercase tracking-widest text-white/60" />
        {waiting.length === 0 ? (
          <Both k="queue.pleaseWait" className="block text-[clamp(1rem,1.8vw,1.8rem)] text-white/50" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {waiting.map((n) => (
              <span key={n} className="grid h-[clamp(3.5rem,8vh,6rem)] min-w-[clamp(3.5rem,8vh,6rem)] place-items-center rounded-2xl bg-white/10 px-3 text-[clamp(1.6rem,3.5vh,3rem)] font-bold tabular-nums ring-1 ring-white/20">
                {n}
              </span>
            ))}
            {more > 0 && (
              <span className="px-3 text-[clamp(1.2rem,2.5vh,2.2rem)] font-semibold text-white/70">+{more}</span>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

/** A soft two-note chime, generated — no audio file to host or fail to load. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio blocked until the screen is interacted with — the flash still shows */ }
}
