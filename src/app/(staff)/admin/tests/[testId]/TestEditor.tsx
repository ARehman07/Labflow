'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { saveTestAction, type TestEditDTO } from '@/modules/admin/admin.actions';

type Param = TestEditDTO['parameters'][number];

const emptyParam = (): Param => ({
  name: '', code: '', unit: '', valueType: 'NUMBER', options: '',
  isBold: false, refLow: '', refHigh: '', refText: '', formula: '',
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
  const [params, setParams] = useState<Param[]>(initial?.parameters?.length ? initial.parameters : [emptyParam()]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const valueTypeOpts = [
    { value: 'NUMBER', label: t('admin.valueNumber') },
    { value: 'TEXT', label: t('admin.valueText') },
    { value: 'OPTION', label: t('admin.valueOption') },
    { value: 'CALCULATED', label: t('admin.valueCalculated') },
  ];

  const updateParam = (i: number, patch: Partial<Param>) =>
    setParams((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  function save() {
    setError(null);
    startTransition(async () => {
      const input = {
        name, code, departmentId, tatHours: Number(tatHours), specimenType, price: Number(price),
        parameters: params.map((p) => ({
          name: p.name, code: p.code, unit: p.unit, valueType: p.valueType, options: p.options,
          isBold: p.isBold, refLow: p.refLow, refHigh: p.refHigh, refText: p.refText, formula: p.formula,
        })),
      };
      const res = await saveTestAction(testId, input);
      if (res.ok) { toast('success', t('admin.saveTest')); router.push('/admin/tests'); }
      else { setError(res.error ?? 'Failed'); toast('error', res.error ?? 'Failed'); }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/tests" className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-body">
          <Icon name="dashboard" className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">
          {testId ? t('admin.editTest') : t('admin.newTest')}
        </h1>
      </div>

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
            <Select value={specimenType} onChange={setSpecimenType} options={SPECIMENS.map((s) => ({ value: s, label: s }))} />
          </div>
          <div><label className="label">{t('admin.price')}</label><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="field" /></div>
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

            {p.valueType === 'OPTION' && (
              <div className="mt-3"><label className="label">{t('admin.options')}</label><input value={p.options} onChange={(e) => updateParam(i, { options: e.target.value })} placeholder="A+,A-,B+,O+" className="field" /></div>
            )}
            {p.valueType === 'CALCULATED' && (
              <div className="mt-3"><label className="label">{t('admin.formula')}</label>
                <input value={p.formula} onChange={(e) => updateParam(i, { formula: e.target.value })} placeholder={t('admin.formulaHint')} className="field font-mono" />
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><label className="label">{t('admin.low')}</label><input type="number" value={p.refLow} onChange={(e) => updateParam(i, { refLow: e.target.value })} className="field" /></div>
              <div><label className="label">{t('admin.high')}</label><input type="number" value={p.refHigh} onChange={(e) => updateParam(i, { refHigh: e.target.value })} className="field" /></div>
              <div><label className="label">{t('admin.refText')}</label><input value={p.refText} onChange={(e) => updateParam(i, { refText: e.target.value })} className="field" /></div>
            </div>

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

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={save} loading={isPending} disabled={!name || !code || !departmentId}>
          <Icon name="approve" className="h-4 w-4" /> {t('admin.saveTest')}
        </Button>
      </div>
    </div>
  );
}
