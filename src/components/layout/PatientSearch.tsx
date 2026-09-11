'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { searchPatientsAction, type PatientDTO } from '@/modules/reception/reception.actions';
import { findVisitByScanAction, type ScanHitDTO } from '@/modules/patients/patients.actions';
import { useToast } from '@/components/ui/Toast';
import { parseScan } from '@/lib/scan';

/**
 * Find any patient from anywhere, and land on their history.
 *
 * Inline in the top bar on a wide screen. On a phone or tablet it is an icon
 * that opens a full-width search row under the bar, so the field is never too
 * narrow to type a name into.
 */
export function PatientSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // A slip number, slip QR or tube barcode also finds its booking.
  const [hit, setHit] = useState<ScanHitDTO | null>(null);
  const toast = useToast();
  const deb = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(deb.current);
    if (q.trim().length < 2) { setResults([]); setHit(null); setLoading(false); return; }
    setLoading(true);
    deb.current = setTimeout(() => {
      const scan = parseScan(q);
      Promise.all([
        searchPatientsAction(q).then(setResults).catch(() => setResults([])),
        scan ? findVisitByScanAction(q).then(setHit).catch(() => setHit(null)) : Promise.resolve(setHit(null)),
      ]).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q]);

  function go(href: string) {
    setQ(''); setHit(null); setOpen(false);
    router.push(href);
  }

  const items: ComboItem[] = [
    ...(hit ? [{
      id: `visit:${hit.visitId}`,
      label: t('search.slipHit').replace('{slip}', hit.slipNo).replace('{name}', hit.patientName),
      sublabel: t('search.openVisit'),
    }] : []),
    ...results.map((p) => ({
      id: p.id,
      label: p.fullName,
      sublabel: [p.mrNo, p.mobile].filter(Boolean).join(' · '),
    })),
  ];

  const combo = (
    <Combobox
      query={q}
      onQueryChange={setQ}
      items={items}
      onSelect={(it) => go(it.id.startsWith('visit:') && hit ? hit.href : `/patients/${it.id}`)}
      onEnterEmpty={(raw) => {
        if (!parseScan(raw)) return;
        findVisitByScanAction(raw)
          .then((h) => (h ? go(h.href) : toast('error', t('search.scanNotFound'))))
          .catch(() => toast('error', t('search.scanNotFound')));
      }}
      placeholder={t('search.patients')}
      loading={loading}
      minChars={2}
      emptyText={t('reception.noResults')}
      leftIcon={<Icon name="search" className="h-4 w-4" />}
    />
  );

  return (
    <>
      <div className="hidden w-80 lg:block">{combo}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('search.open')}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-strong lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-[66px] z-30 animate-fade-in border-b border-line bg-surface p-3 shadow-dropdown lg:hidden">
          {combo}
        </div>
      )}
    </>
  );
}
