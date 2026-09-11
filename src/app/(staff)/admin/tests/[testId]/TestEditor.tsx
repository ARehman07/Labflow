'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { saveTestAction, type TestEditDTO } from '@/modules/admin/admin.actions';
import { Check, Plus, X } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { Tr } from '@/components/ui/Tr';

type Param = TestEditDTO['parameters'][number];

type Range = Param['ranges'][number];

const emptyRange = (): Range => ({
  sex: 'ANY', ageMin: '', ageMax: '', ageUnit: 'YEARS',
  low: '', high: '', criticalLow: '', criticalHigh: '', text: '',
});

const emptyParam = (): Param => ({
  name: '', code: '', unit: '', valueType: 'NUMBER', options: '',
  isBold: false, refLow: '', refHigh: '', refText: '', formula: '',
  cutoff: '', positiveLabel: '', negativeLabel: '',
  ranges: [emptyRange()],
});

const SPECIMENS = ['BLOOD', 'SERUM', 'PLASMA', 'URINE', 'STOOL', 'SWAB', 'OTHER'];

export function TestEditor({
  initial,
  departments,
  testId,
}: {
  initial: TestEditDTO | null;
  departments: { id: string; name: string }[];
  testId: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? '');
  const [tatHours, setTatHours] = useState(String(initial?.tatHours ?? 24));
  const [specimenType, setSpecimenType] = useState(initial?.specimenType ?? 'BLOOD');
  const [price, setPrice] = useState(String(initial?.price ?? 0));
  const [methodNote, setMethodNote] = useState(initial?.methodNote ?? '');
  const [reportFormat, setReportFormat] = useState<'STANDARD' | 'CULTURE'>(initial?.reportFormat ?? 'STANDARD');
  const [params, setParams] = useState<Param[]>(initial?.parameters?.length ? initial.parameters : [emptyParam()]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // What was loaded, so the save bar can say when something is unsaved. A new
  // test counts as changed as soon as it has a name.
  const current = JSON.stringify({ name, code, departmentId, tatHours, specimenType, price, methodNote, reportFormat, params });
  const [baseline] = useState(current);
  const dirty = testId ? current !== baseline : name.trim().length > 0;

  const valueTypeOpts = [
    { value: 'NUMBER', label: t('admin.valueNumber') },
    { value: 'TEXT', label: t('admin.valueText') },
    { value: 'OPTION', label: t('admin.valueOption') },
    { value: 'CALCULATED', label: t('admin.valueCalculated') },
    { value: 'CUTOFF', label: t('admin.valueCutoff') },
  ];

  const updateParam = (i: number, patch: Partial<Param>) =>
    setParams((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  function save() {
    setError(null);
    startTransition(async () => {
      const input = {
        name, code, departmentId, tatHours: Number(tatHours), specimenType, price: Number(price), methodNote, reportFormat,
        // A culture is entered as organism and sensitivities; blank parameter rows are not sent.
        parameters: params.filter((p) => reportFormat !== 'CULTURE' || p.name.trim()).map((p) => ({
          name: p.name, code: p.code, unit: p.unit, valueType: p.valueType, options: p.options,
          isBold: p.isBold, formula: p.formula,
          cutoff: p.cutoff, positiveLabel: p.positiveLabel, negativeLabel: p.negativeLabel,
          // Ranges carry the limits now; the single legacy fields are left blank.
          refLow: '', refHigh: '', refText: '',
          ranges: p.ranges,
        })),
      };
      const res = await saveTestAction(testId, input);
      if (res.ok) { toast('success', t('admin.saveTest')); router.push('/admin/tests'); }
      else { setError(res.error ?? 'Failed'); toast('error', res.error ?? 'Failed'); }
    });
  }

  return (
    <div className="page">
      {/* The way out used to be the dashboard's grid icon, which read as "go to
          dashboard" rather than "back to the catalogue". */}
      <PageHeader
        title={testId ? t('admin.editTest') : t('admin.newTest')}
        subtitle={name || undefined}
        back={{ href: '/admin/tests', label: t('admin.tests') }}
      />

      {/* Test-level fields */}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">{t('admin.name')}</label><input value={name} onChange={(e) => setName(e.target.value)} className="field" /></div>
          <div><label className="label">{t('admin.code')}</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="field" /></div>
          <div><label className="label">{t('admin.department')}</label>
            <Select value={departmentId} onChange={setDepartmentId} placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </div>
          <div><label className="label">{t('admin.tat')}</label><input type="number" value={tatHours} onChange={(e) => setTatHours(e.target.value)} className="field" /></div>
          <div><label className="label">{t('admin.specimen')}</label>
            <Select value={specimenType} onChange={setSpecimenType} options={SPECIMENS.map((s) => ({ value: s, label: t(`specimen.${s}`) }))} />
          </div>
          <div><label className="label">{t('admin.price')}</label><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="field" /></div>
        </div>
        <div className="mt-3">
          <span className="label">{t('admin.reportFormat')}</span>
          <div className="max-w-md">
            <Segmented
              value={reportFormat}
              onChange={setReportFormat}
              options={[
                { value: 'STANDARD', label: t('admin.formatStandard') },
                { value: 'CULTURE', label: t('admin.formatCulture') },
              ]}
            />
          </div>
          {reportFormat === 'CULTURE' && <p className="mt-1 text-xs text-subtle">{t('admin.formatCultureHint')}</p>}
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="test-method">{t('admin.methodNote')}</label>
          <input id="test-method" value={methodNote} onChange={(e) => setMethodNote(e.target.value)} maxLength={300} placeholder={t('admin.methodNotePlaceholder')} className="field" />
          <p className="mt-1 text-xs text-subtle">{t('admin.methodNoteHint')}</p>
        </div>
      </Card>

      {/* Parameters */}
      <div className="space-y-3">
        <div className="section-title">{t('admin.parameters')}</div>
        {params.map((p, i) => (
          <Card key={i} className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><label className="label">{t('admin.parameter')}</label><input value={p.name} onChange={(e) => updateParam(i, { name: e.target.value })} className="field" /></div>
              <div><label className="label">{t('admin.code')}</label><input value={p.code} onChange={(e) => updateParam(i, { code: e.target.value })} placeholder="e.g. HDL" className="field" /></div>
              <div><label className="label">{t('admin.type')}</label>
                <Select value={p.valueType} onChange={(v) => updateParam(i, { valueType: v })} options={valueTypeOpts} />
              </div>
              <div><label className="label">{t('admin.unit')}</label><input value={p.unit} onChange={(e) => updateParam(i, { unit: e.target.value })} placeholder="mg/dL" className="field" /></div>
            </div>

            {p.valueType === 'CUTOFF' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div><label className="label">{t('admin.cutoff')}</label><input type="number" value={p.cutoff} onChange={(e) => updateParam(i, { cutoff: e.target.value })} className="field tabular-nums" /></div>
                <div><label className="label">{t('admin.positiveLabel')}</label><input value={p.positiveLabel} onChange={(e) => updateParam(i, { positiveLabel: e.target.value })} placeholder="Reactive" className="field" /></div>
                <div><label className="label">{t('admin.negativeLabel')}</label><input value={p.negativeLabel} onChange={(e) => updateParam(i, { negativeLabel: e.target.value })} placeholder="Non-reactive" className="field" /></div>
              </div>
            )}
            {p.valueType === 'OPTION' && (
              <div className="mt-3"><label className="label">{t('admin.options')}</label><input value={p.options} onChange={(e) => updateParam(i, { options: e.target.value })} placeholder="A+,A-,B+,O+" className="field" /></div>
            )}
            {p.valueType === 'CALCULATED' && (
              <div className="mt-3"><label className="label">{t('admin.formula')}</label>
                <input value={p.formula} onChange={(e) => updateParam(i, { formula: e.target.value })} placeholder={t('admin.formulaHint')} className="field font-mono" />
              </div>
            )}

            {p.valueType === 'NUMBER' || p.valueType === 'CALCULATED' ? (
              <RangesEditor ranges={p.ranges} onChange={(ranges) => updateParam(i, { ranges })} />
            ) : (
              // Text and option results are not compared with numbers; only
              // the reference line printed beside them matters.
              <div className="mt-3">
                <label className="label">{t('ranges.textOnly')}</label>
                <input
                  value={p.ranges[0]?.text ?? ''}
                  onChange={(e) => updateParam(i, { ranges: [{ ...(p.ranges[0] ?? emptyRange()), text: e.target.value }] })}
                  className="field"
                />
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={p.isBold} onChange={(e) => updateParam(i, { isBold: e.target.checked })} className="h-4 w-4 rounded border-line-strong text-brand-600" />
                {t('admin.bold')}
              </label>
              {params.length > 1 && (
                <button onClick={() => setParams((ps) => ps.filter((_, idx) => idx !== i))} className="text-sm font-medium text-red-500 hover:underline">
                  {t('admin.removeParam')}
                </button>
              )}
            </div>
          </Card>
        ))}
        <Button variant="outline" onClick={() => setParams((ps) => [...ps, emptyParam()])}>{t('admin.addParameter')}</Button>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text"><Tr text={error} /></p>}

      <SaveBar
        dirty={dirty}
        saving={isPending}
        onSave={save}
        disabled={!name || !code || !departmentId}
        saveLabel={<><Check className="h-4 w-4" /> {t('admin.saveTest')}</>}
      />
    </div>
  );
}

/**
 * The reference ranges for one numeric parameter.
 *
 * The data could always hold a range per sex and per age band, with panic
 * limits — a haemoglobin of 12 is normal for a woman and low for a man, and a
 * newborn's ranges are nothing like an adult's — but the screen only offered a
 * single Low and High, so every lab entered one range for everybody.
 */
function RangesEditor({ ranges, onChange }: { ranges: Range[]; onChange: (r: Range[]) => void }) {
  const { t } = useI18n();
  const update = (i: number, patch: Partial<Range>) =>
    onChange(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const mini = 'field min-w-0 py-1.5 text-sm tabular-nums';
  const cap = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-subtle';

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label mb-0">{t('ranges.title')}</span>
        <span className="text-xs text-muted">{t('ranges.hint')}</span>
      </div>

      <ul className="mt-2 space-y-2">
        {ranges.map((r, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="grid gap-3 md:grid-cols-[12rem_minmax(15rem,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] md:items-end">
              <div>
                <span className={cap}>{t('ranges.sex')}</span>
                <Segmented
                  size="sm"
                  value={r.sex}
                  onChange={(sex) => update(i, { sex })}
                  options={[
                    { value: 'ANY', label: t('ranges.any') },
                    { value: 'MALE', label: t('reception.male') },
                    { value: 'FEMALE', label: t('reception.female') },
                  ]}
                />
              </div>

              <div>
                <span className={cap}>{t('ranges.age')}</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} value={r.ageMin} placeholder={t('ranges.from')}
                    onChange={(e) => update(i, { ageMin: e.target.value })} className={`${mini} w-20 shrink-0`} aria-label={t('ranges.from')} />
                  <span className="text-subtle">–</span>
                  <input type="number" min={0} value={r.ageMax} placeholder={t('ranges.to')}
                    onChange={(e) => update(i, { ageMax: e.target.value })} className={`${mini} w-20 shrink-0`} aria-label={t('ranges.to')} />
                  <select
                    value={r.ageUnit}
                    onChange={(e) => update(i, { ageUnit: e.target.value as Range['ageUnit'] })}
                    className="field min-w-0 flex-1 py-1.5 text-sm"
                    aria-label={t('ranges.age')}
                  >
                    {(['YEARS', 'MONTHS', 'DAYS'] as const).map((u) => (
                      <option key={u} value={u}>{t(`ranges.unit${u}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <span className={cap}>{t('ranges.normal')}</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" value={r.low} placeholder={t('ranges.low')}
                    onChange={(e) => update(i, { low: e.target.value })} className={mini} aria-label={`${t('ranges.normal')} ${t('ranges.low')}`} />
                  <span className="text-subtle">–</span>
                  <input type="number" value={r.high} placeholder={t('ranges.high')}
                    onChange={(e) => update(i, { high: e.target.value })} className={mini} aria-label={`${t('ranges.normal')} ${t('ranges.high')}`} />
                </div>
              </div>

              <div>
                <span className={cap}>{t('ranges.critical')}</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" value={r.criticalLow} placeholder={t('ranges.low')}
                    onChange={(e) => update(i, { criticalLow: e.target.value })} className={mini} aria-label={`${t('ranges.critical')} ${t('ranges.low')}`} />
                  <span className="text-subtle">–</span>
                  <input type="number" value={r.criticalHigh} placeholder={t('ranges.high')}
                    onChange={(e) => update(i, { criticalHigh: e.target.value })} className={mini} aria-label={`${t('ranges.critical')} ${t('ranges.high')}`} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => onChange(ranges.filter((_, idx) => idx !== i))}
                aria-label={t('ranges.remove')}
                title={t('ranges.remove')}
                className="grid h-9 w-9 place-items-center justify-self-end rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5">
              <span className={cap}>{t('ranges.text')}</span>
              <input value={r.text} onChange={(e) => update(i, { text: e.target.value })}
                placeholder="e.g. Male: 13–17" className="field py-1.5 text-sm" />
            </div>
          </li>
        ))}
      </ul>

      <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...ranges, emptyRange()])}>
        <Plus className="h-3.5 w-3.5" /> {t('ranges.add')}
      </Button>
    </div>
  );
}
