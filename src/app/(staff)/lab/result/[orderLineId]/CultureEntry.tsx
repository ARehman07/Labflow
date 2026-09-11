'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import { saveCultureAction, type EntryDTO } from '@/modules/lab/lab.actions';

type Mark = 'S' | 'I' | 'R';

/** Organisms a lab reports most, offered as the organism is typed. */
const COMMON_ORGANISMS = [
  'Escherichia coli', 'Klebsiella pneumoniae', 'Staphylococcus aureus', 'Pseudomonas aeruginosa',
  'Proteus mirabilis', 'Enterococcus faecalis', 'Acinetobacter baumannii', 'Candida albicans',
  'Streptococcus pyogenes', 'Salmonella Typhi', 'Enterobacter cloacae', 'Citrobacter freundii',
];

/**
 * Culture & sensitivity entry.
 *
 * Growth or no growth is the first question. With growth: the organism, the
 * colony count, then one tap per antibiotic — S, I or R — down the lab's
 * panel. Only antibiotics given a mark are saved and printed.
 */
export function CultureEntry({ entry }: { entry: EntryDTO }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const editable = entry.canEdit;
  const init = useMemo(() => ({
    growth: entry.culture?.growth ?? false,
    organism: entry.culture?.organism ?? '',
    colonyCount: entry.culture?.colonyCount ?? '',
    incubation: entry.culture?.incubation ?? '',
    remarks: entry.culture?.remarks ?? '',
    marks: Object.fromEntries((entry.culture?.sensitivities ?? []).map((s) => [s.antibiotic, { result: s.result, mic: s.mic }])) as Record<string, { result: Mark; mic: string }>,
  }), [entry]);
  const [form, setForm] = useState(init);
  const [baseline, setBaseline] = useState(init);
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const panel = useMemo(() => {
    const names = [...entry.antibiotics];
    for (const n of Object.keys(form.marks)) if (!names.includes(n)) names.push(n);
    return names;
  }, [entry.antibiotics, form.marks]);

  const setMark = (name: string, result: Mark) => setForm((f) => {
    const marks = { ...f.marks };
    if (marks[name]?.result === result) delete marks[name];
    else marks[name] = { result, mic: marks[name]?.mic ?? '' };
    return { ...f, marks };
  });

  function save(thenNext = false) {
    setError(null);
    startTransition(async () => {
      const res = await saveCultureAction({
        orderLineId: entry.orderLineId,
        growth: form.growth,
        organism: form.organism,
        colonyCount: form.colonyCount,
        incubation: form.incubation,
        remarks: form.remarks,
        sensitivities: panel.filter((n) => form.marks[n]).map((n) => ({ antibiotic: n, result: form.marks[n].result, mic: form.marks[n].mic || undefined })),
      });
      if (res.ok) {
        setBaseline(form);
        toast('success', t('result.saved'));
        if (thenNext && entry.next) router.push(`/lab/result/${entry.next.orderLineId}`);
        else router.refresh();
      } else {
        setError(res.error);
        toast('error', res.error);
      }
    });
  }

  const meta = [entry.mrNo, entry.age != null ? `${entry.age} ${t('common.years')}` : null, entry.sex ? t(`reception.${entry.sex.toLowerCase()}`) : null].filter(Boolean).join(' · ');
  const marked = panel.filter((n) => form.marks[n]).length;

  return (
    <div className="page">
      <PageHeader
        title={entry.testName}
        subtitle={`${entry.patientName} · ${meta}`}
        back={{ href: '/lab', label: t('result.back') }}
      />
      {!editable && <p className="note-warn">{t('result.notEditable')}</p>}

      <Card className="space-y-4 p-5">
        <div className="max-w-sm">
          <span className="label">{t('culture.result')}</span>
          <Segmented
            value={form.growth ? 'GROWTH' : 'NONE'}
            onChange={(v) => editable && setForm((f) => ({ ...f, growth: v === 'GROWTH' }))}
            options={[
              { value: 'NONE', label: t('culture.noGrowth') },
              { value: 'GROWTH', label: t('culture.growth') },
            ]}
          />
        </div>

        {form.growth && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cul-org">{t('culture.organism')}</label>
              <input id="cul-org" list="cul-organisms" value={form.organism} disabled={!editable} onChange={(e) => setForm({ ...form, organism: e.target.value })} className="field" />
              <datalist id="cul-organisms">{COMMON_ORGANISMS.map((o) => <option key={o} value={o} />)}</datalist>
            </div>
            <div>
              <label className="label" htmlFor="cul-cc">{t('culture.colonyCount')}</label>
              <input id="cul-cc" value={form.colonyCount} disabled={!editable} onChange={(e) => setForm({ ...form, colonyCount: e.target.value })} placeholder=">10^5 CFU/mL" className="field" />
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cul-inc">{t('culture.incubation')}</label>
            <input id="cul-inc" value={form.incubation} disabled={!editable} onChange={(e) => setForm({ ...form, incubation: e.target.value })} placeholder={t('culture.incubationPlaceholder')} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="cul-rem">{t('result.remarks')}</label>
            <input id="cul-rem" value={form.remarks} disabled={!editable} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="field" />
          </div>
        </div>
      </Card>

      {form.growth && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-strong">{t('culture.sensitivity')}</span>
            <span className="text-xs text-subtle">{t('culture.markedN').replace('{n}', String(marked))}</span>
          </div>
          <ul className="divide-y divide-line/70">
            {panel.map((name) => {
              const m = form.marks[name];
              return (
                <li key={name} className={cn('flex flex-wrap items-center gap-3 px-4 py-2', m && 'bg-surface-2/60')}>
                  <span className={cn('min-w-0 flex-1 text-sm', m ? 'font-semibold text-body' : 'text-muted')}>{name}</span>
                  <span className="flex gap-1" role="group" aria-label={name}>
                    {(['S', 'I', 'R'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        disabled={!editable}
                        aria-pressed={m?.result === k}
                        title={t(`culture.${k}`)}
                        onClick={() => setMark(name, k)}
                        className={cn('grid h-8 w-8 place-items-center rounded-lg border text-sm font-extrabold transition-colors',
                          m?.result === k
                            ? k === 'S' ? 'border-emerald-600 bg-emerald-600 text-white' : k === 'I' ? 'border-amber-500 bg-amber-500 text-white' : 'border-red-600 bg-red-600 text-white'
                            : 'border-line text-subtle hover:border-line-strong hover:text-body')}
                      >
                        {k}
                      </button>
                    ))}
                  </span>
                  <input
                    value={m?.mic ?? ''}
                    disabled={!editable || !m}
                    onChange={(e) => setForm((f) => ({ ...f, marks: { ...f.marks, [name]: { ...f.marks[name], mic: e.target.value } } }))}
                    placeholder="MIC"
                    aria-label={`${name} MIC`}
                    className="field w-20 py-1.5 text-sm tabular-nums"
                  />
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="flex gap-2 border-t border-line px-4 py-3">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t('culture.addAntibiotic')} aria-label={t('culture.addAntibiotic')} className="field min-w-0 flex-1 py-2 text-sm" />
              <Button variant="outline" size="sm" disabled={extra.trim().length < 2} onClick={() => { const n = extra.trim(); setForm((f) => ({ ...f, marks: { ...f.marks, [n]: f.marks[n] ?? { result: 'S', mic: '' } } })); setExtra(''); }}>
                <Plus className="h-3.5 w-3.5" /> {t('culture.add')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {error && <p className="note-danger"><Tr text={error} /></p>}

      {editable && (
        <SaveBar
          dirty={dirty}
          saving={isPending}
          onSave={() => save()}
          onDiscard={() => setForm(baseline)}
          saveLabel={t('result.save')}
          disabled={form.growth && !form.organism.trim()}
          extra={entry.next && (
            <Button variant="outline" onClick={() => (dirty ? save(true) : router.push(`/lab/result/${entry.next!.orderLineId}`))} disabled={isPending}>
              {dirty ? t('result.saveNext') : t('result.nextTest')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          )}
        />
      )}
    </div>
  );
}
