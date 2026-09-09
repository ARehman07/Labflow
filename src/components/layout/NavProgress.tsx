'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A bar that appears the moment a link is clicked and finishes when the new
 * route lands.
 *
 * The server answers most pages in well under 200ms, but the App Router holds
 * the old screen until the next one is ready — so a click looked like nothing
 * had happened, and people clicked again.
 *
 * Two things it has to get right, both learned the hard way:
 *  - It must not look like the Topbar's static keyline, which is also a thin
 *    brand gradient pinned to the top of the viewport. The first version was
 *    the same height, position and colours, and was therefore invisible.
 *  - It must stay up long enough to register. A 90ms navigation that flashes
 *    a bar for 90ms reads as no feedback at all, so completion is held back
 *    to a minimum visible time.
 */

/** Long enough to be seen, short enough not to feel like an added delay. */
const MIN_VISIBLE_MS = 420;

export function NavProgress() {
  // useSearchParams needs a Suspense boundary, or it opts the whole route out
  // of static rendering at build time.
  return (
    <Suspense fallback={null}>
      <NavProgressInner />
    </Suspense>
  );
}

function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const startedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page — nothing is going to load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      clearTimers();
      startedAt.current = Date.now();
      setState('running');
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
  }, [clearTimers]);

  // The route changed, so whatever we were waiting for has arrived.
  useEffect(() => {
    if (startedAt.current === 0) return;
    const elapsed = Date.now() - startedAt.current;
    const hold = Math.max(0, MIN_VISIBLE_MS - elapsed);
    clearTimers();
    timers.current.push(
      setTimeout(() => setState('done'), hold),
      setTimeout(() => { setState('idle'); startedAt.current = 0; }, hold + 260),
    );
  }, [pathname, search, clearTimers]);

  if (state === 'idle') return null;

  return (
    <div
      className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden"
      role="progressbar"
      aria-label="Loading page"
    >
      <div
        className={
          state === 'running'
            ? 'nav-progress-bar h-full w-full origin-left animate-nav-progress'
            : 'nav-progress-bar h-full w-full origin-left scale-x-100 opacity-0 transition-opacity duration-200'
        }
      />
    </div>
  );
}
