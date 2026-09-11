'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Package, Pencil, Plus, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn, formatPkr } from '@/lib/utils';
import { searchTestsAction } from '@/modules/reception/reception.actions';
import type { TestListItem } from '@/modules/catalog/catalog.service';
import {
  listPackagesAction,
  savePackageAction,
  setPackageActiveAction,
  type PackageDTO,
} from '@/modules/pricing/pricing.actions';

type Draft = { id: string | null; name: string; price: string; tests: { id: string; name: string; price: number }[] };

/**
 * Test packages: several tests sold together at one price ("Medical Package",
 * "Baseline"). At booking a package adds all its tests, and its price is
 * shared across them so a removed test refunds its own part.
 */
export function PackagesClient({ initial }: { initial: PackageDTO[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [packages, setPackages] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState('');
  const [results, setResults] = useState<TestListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(deb.current);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    deb.current = setTimeout(() => {
      searchTestsAction(q).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q]);

  const reload = () => listPackagesAction(true).then(setPackages);
  const listTotal = draft?.tests.reduce((s, x) => s + x.price, 0) ?? 0;
  const price = Number(draft?.price) || 0;

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await savePackageAction(draft.id, { name: draft.name, price, testIds: draft.tests.map((x) => x.id) });
      if (res.ok) { toast('success', t('pkg.saved')); setDraft(null); await reload(); }
      else setError(res.error);
    });
  }

  async function toggle(p: PackageDTO) {
    setBusy(p.id);
    await setPackageActiveAction(p.id, !p.isActive);
    setBusy(null);
    await reload();
  }

  const items: ComboItem[] = results
    .filter((r) => !draft?.tests.some((x) => x.id === r.id))
    .map((r) => ({ id: r.id, label: r.name, sublabel: r.departmentName, right: formatPkr(r.price) }));

  return (
    <div className="page">
      <PageHeader
        title={t('pkg.title')}
        subtitle={t('pkg.subtitle')}
        back={{ href: '/admin', label: t('admin.title') }}
        actions={!draft ? (
          <Button onClick={() => { setDraft({ id: null, name: '', price: '', tests: [] }); setError(null); }}>
            <Plus className="h-4 w-4" /> {t('pkg.new')}
          </Button>
        ) : undefined}
      />

      {draft && (
        <Card className="animate-fade-in-up space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold text-strong">{draft.id ? t('pkg.edit') : t('pkg.new')}</h2>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} aria-label={t('common.cancel')}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div>
              <label className="label" htmlFor="pkg-name">{t('pkg.name')}</label>
              <input id="pkg-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field" placeholder={t('pkg.namePlaceholder')} />
            </div>
            <div>
              <label className="label" htmlFor="pkg-price">{t('pkg.price')}</label>
              <input id="pkg-price" type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="field tabular-nums" />
            </div>
          </div>
          <div>
            <span className="label">{t('pkg.tests')}</span>
            <Combobox
              query={q}
              onQueryChange={setQ}
              items={items}
              onSelect={(it) => {
                const r = results.find((x) => x.id === it.id);
                if (r) setDraft({ ...draft, tests: [...draft.tests, { id: r.id, name: r.name, price: r.price }] });
                setQ('');
              }}
              placeholder={t('pkg.addTest')}
              loading={searching}
              emptyText={t('reception.noResults')}
              leftIcon={<Plus className="h-4 w-4" />}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.tests.map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pe-1 ps-2.5 text-xs font-semibold text-body">
                  {x.name} <span className="font-normal text-subtle">{formatPkr(x.price)}</span>
                  <button type="button" onClick={() => setDraft({ ...draft, tests: draft.tests.filter((y) => y.id !== x.id) })} className="grid h-5 w-5 place-items-center rounded-full text-subtle hover:bg-danger-soft hover:text-danger-text" aria-label={t('common.remove')}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {draft.tests.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                {t('pkg.listTotal').replace('{amount}', formatPkr(listTotal))}
                {price > 0 && price < listTotal && (
                  <span className="ms-2 font-semibold text-ok-text">{t('pkg.saves').replace('{amount}', formatPkr(listTotal - price))}</span>
                )}
              </p>
            )}
          </div>
          {error && <p className="note-danger"><Tr text={error} /></p>}
          <div className="flex gap-2">
            <Button onClick={save} loading={isPending} disabled={draft.name.trim().length < 2 || draft.tests.length < 2 || draft.price === ''}>{t('pkg.save')}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}

      {packages.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{t('pkg.none')}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {packages.map((p) => (
            <Card key={p.id} className={cn('space-y-2 p-4', !p.isActive && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Package className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-strong">{p.name}</h3>
                    {!p.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                  </div>
                  <div className="text-sm">
                    <span className="font-bold tabular-nums text-strong">{formatPkr(p.price)}</span>
                    {p.listTotal > p.price && <span className="ms-2 text-xs text-subtle line-through">{formatPkr(p.listTotal)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setDraft({ id: p.id, name: p.name, price: String(p.price), tests: p.tests }); setError(null); }}>
                    <Pencil className="h-3.5 w-3.5" /> {t('pkg.editShort')}
                  </Button>
                  <Button variant="ghost" size="sm" loading={busy === p.id} onClick={() => toggle(p)}>
                    {p.isActive ? t('accounts.hide') : t('accounts.show')}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted">{p.tests.map((x) => x.name).join(' · ')}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
