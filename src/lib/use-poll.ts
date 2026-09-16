'use client';

import { useEffect, useRef } from 'react';

/**
 * Refresh on an interval, but only while the tab is actually on screen.
 *
 * Every board in the lab polls — the queue every few seconds, the nav counts
 * every minute — and they used to keep polling on a laptop shut in a drawer or
 * a tab nobody has looked at since morning. Hidden tabs stop; coming back
 * refreshes once straight away, so what you see on return is current.
 */
export function usePoll(refresh: () => void, everyMs: number) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { timer ??= setInterval(() => { if (!document.hidden) latest.current(); }, everyMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      latest.current();
      start();
    };

    latest.current();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [everyMs]);
}
