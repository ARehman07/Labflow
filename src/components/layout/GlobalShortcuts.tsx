'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Keyboard shortcuts that work from any screen, the way xMed staff are used to:
 *
 *   Alt+L  new booking            Alt+T  lab board (test results)
 *   Alt+B  billing                Alt+Q  queue
 *   Alt+R  reports ready          Alt+H  find a patient (top search)
 *
 * Each only works for someone allowed to open that screen. On the booking
 * screen Alt+T keeps its meaning there — jump to the test search.
 */
export function GlobalShortcuts({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const has = (...codes: string[]) => codes.some((c) => permissions.includes(c));
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const go = (href: string) => { e.preventDefault(); if (pathname !== href) router.push(href); };
      switch (e.code) {
        case 'KeyL': if (has('visit.create')) go('/reception'); break;
        case 'KeyT': if (pathname !== '/reception' && has('result.enter', 'sample.collect', 'workflow.advance')) go('/lab'); break;
        case 'KeyB': if (has('billing.view')) go('/billing'); break;
        case 'KeyQ': if (has('workflow.advance')) go('/queue'); break;
        case 'KeyR': if (has('report.print', 'report.deliver')) go('/reception/ready'); break;
        case 'KeyH': {
          const input = document.querySelector<HTMLInputElement>('header input');
          if (input && input.offsetParent !== null) { e.preventDefault(); input.focus(); }
          break;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [permissions, pathname, router]);

  return null;
}
