'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { formatPkr } from '@/lib/utils';
import { partnerBookAction, partnerSearchTestsAction } from '@/modules/partners/portal.actions';
import type { TestListItem } from '@/modules/catalog/catalog.service';

/**
 * A partner lab books the patient it is sending: who, which tests, and its own
 * sample number. Prices are its agreed rates; the bill goes to its account.
 */
export function PartnerBook() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState('YEARS');
  const [sex, setSex] = useState('');
  const [mobile, setMobile] = useState('');
  const [b2bNo, setB2bNo] = useState('');
  const [notes, setNotes] = useState('');
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TestListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deb = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(deb.current);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    deb.current = setTimeout(() => {
      partnerSearchTestsAction(q).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [q]);

  const items: ComboItem[] = results.filter((r) => !tests.some((x) => x.id === r.id)).map((r) => ({ id: r.id, label: r.name, sublabel: r.departmentName, right: formatPkr(r.price) }));
  const total = tests.reduce((s, x) => s + x.price, 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await partnerBookAction({ fullName, age: age ? Number(age) : undefined, ageUnit, sex: sex || undefined, mobile, testIds: tests.map((x) => x.id), b2bNo, notes });
      if (res.ok) { toast('success', t('portal.b2b.booked').replace('{slip}', res.slipNo)); router.push('/partner'); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('portal.b2b.book')}</h1>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <div className="section-title">{t('reception.patient')}</div>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('reception.fullName')} aria-label={t('reception.fullName')} className="field" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <input type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} placeholder={t('reception.age')} aria-label={t('reception.age')} className="field" />
              <Select value={ageUnit} onChange={setAgeUnit} options={[{ value: 'YEARS', label: t('reception.years') }, { value: 'MONTHS', label: t('reception.months') }, { value: 'DAYS', label: t('reception.days') }]} />
              <Select value={sex} onChange={setSex} placeholder={t('reception.sex')} options={[{ value: 'MALE', label: t('reception.male') }, { value: 'FEMALE', label: t('reception.female') }, { value: 'OTHER', label: t('reception.other') }]} />
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder={t('reception.mobile')} aria-label={t('reception.mobile')} className="field" inputMode="tel" />
            </div>
          </Card>
          <Card className="space-y-3 p-5">
            <div className="section-title">{t('reception.tests')}</div>
            <Combobox
              query={q}
              onQueryChange={setQ}
              items={items}
              onSelect={(it) => { const r = results.find((x) => x.id === it.id); if (r) setTests((ts) => [...ts, r]); setQ(''); }}
              placeholder={t('reception.searchTest')}
              loading={searching}
              emptyText={t('reception.noResults')}
              leftIcon={<Plus className="h-4 w-4" />}
            />
            <ul className="space-y-1">
              {tests.map((x) => (
                <li key={x.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2">
                  <span className="font-medium text-body">{x.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-muted">{formatPkr(x.price)}</span>
                    <button type="button" onClick={() => setTests((ts) => ts.filter((y) => y.id !== x.id))} aria-label={t('common.remove')} className="grid h-6 w-6 place-items-center rounded-full text-subtle hover:bg-danger-soft hover:text-danger-text"><X className="h-3.5 w-3.5" /></button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="pb-b2b">{t('reception.b2bNo')}</label>
            <input id="pb-b2b" value={b2bNo} onChange={(e) => setB2bNo(e.target.value)} maxLength={40} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="pb-notes">{t('reception.notes')}</label>
            <textarea id="pb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={3} className="field resize-y" />
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-lg font-extrabold text-strong">
            <span>{t('reception.total')}</span><span className="tabular-nums">{formatPkr(total)}</span>
          </div>
          {error && <p className="note-danger"><Tr text={error} /></p>}
          <Button className="w-full" size="lg" onClick={submit} loading={isPending} disabled={fullName.trim().length < 2 || tests.length === 0}>{t('portal.b2b.submit')}</Button>
        </Card>
      </div>
    </div>
  );
}
