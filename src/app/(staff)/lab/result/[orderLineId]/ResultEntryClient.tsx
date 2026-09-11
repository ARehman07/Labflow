'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, History, Lock, MessageSquareText, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/core/i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { FlagBadge } from '@/components/ui/FlagBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { computeResultSet, interpretCutoff, type ParameterDef } from '@/modules/lab/calc-engine';
import { saveResultsAction, type EntryDTO } from '@/modules/lab/lab.actions';
import { uploadAttachmentAction } from '@/modules/attachments/attachments.actions';
import { Tr } from '@/components/ui/Tr';

const OUT = new Set(['HIGH', 'LOW', 'CRITICAL']);

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(iso));

/**
 * Entering a test's results at the bench.
 *
 * Built for speed and for catching mistakes while they are still being made:
 *  - each value is flagged and every calculated value worked out as it is
 *    typed, with the same engine the server uses when saving — the old screen
 *    only showed flags after a save, so a slipped decimal went unnoticed;
 *  - Enter moves to the next value, so a panel is keyed without the mouse;
 *  - the patient's last released result sits beside each value, because a
 *    change from last time is often the thing worth a second look.
 */
export function ResultEntryClient({ entry }: { entry: EntryDTO }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [goingNext, setGoingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = entry.canEdit;

  const initialValues = useMemo(() => {
    const init: Record<string, string> = {};
    for (const p of entry.params) if (p.valueType !== 'CALCULATED') init[p.code] = p.existingValue ?? '';
    return init;
  }, [entry]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [remarks, setRemarks] = useState(entry.remarks);
  const [savedRemarks, setSavedRemarks] = useState(entry.remarks);
  const [baseline, setBaseline] = useState<Record<string, string>>(initialValues);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline) || remarks !== savedRemarks;

  const defs: ParameterDef[] = useMemo(() => entry.params.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    valueType: p.valueType as ParameterDef['valueType'],
    sortOrder: p.sortOrder,
    referenceRanges: p.ranges,
    formula: p.formula ? { expression: p.formula, inputs: [] } : null,
    cutoff: p.cutoff,
  })), [entry]);

  // Recomputed on every keystroke — cheap, and it is the same calculation the
  // server will run, so what is shown is what will be saved.
  const live = useMemo(() => {
    const out = computeResultSet(defs, values, {
      ageDays: entry.ageDays,
      sex: entry.sex as 'MALE' | 'FEMALE' | 'OTHER' | null,
    } as Parameters<typeof computeResultSet>[2]);
    return new Map(out.map((r) => [r.code, r]));
  }, [defs, values, entry.ageDays, entry.sex]);

  const criticalCount = entry.params.filter((p) => {
    const r = live.get(p.code);
    return r && r.value != null && r.value !== '' && r.flag === 'CRITICAL';
  }).length;

  // Enter jumps to the next field, in the order the fields are drawn.
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const measured = entry.params.filter((p) => p.valueType !== 'CALCULATED' && !(p.valueType === 'OPTION' && p.options));
  function onEnter(e: React.KeyboardEvent<HTMLInputElement>, code: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && entry.next) { goNext(); return; }
    const i = measured.findIndex((p) => p.code === code);
    const next = fields.current[i + 1];
    if (next) next.focus();
    else if (dirty) save();
  }

  const nextHref = entry.next ? `/lab/result/${entry.next.orderLineId}` : null;

  /** Save if anything changed, then open the next test — the bench's usual rhythm. */
  function goNext() {
    if (!nextHref) return;
    if (dirty) save(true);
    else { setGoingNext(true); router.push(nextHref); }
  }

  function save(thenNext = false) {
    setError(null);
    startTransition(async () => {
      const res = await saveResultsAction({ orderLineId: entry.orderLineId, values, remarks });
      if (res.ok) {
        setBaseline(values);
        setSavedRemarks(remarks);
        toast('success', t('result.saved'));
        if (thenNext && nextHref) { setGoingNext(true); router.push(nextHref); }
      } else {
        setError(res.error ?? 'Save failed');
        toast('error', res.error ?? 'Save failed');
      }
    });
  }

  const meta = [
    entry.mrNo,
    entry.age != null ? `${entry.age} ${t('common.years')}` : null,
    entry.sex ? t(`reception.${entry.sex.toLowerCase()}`) : null,
  ].filter(Boolean).join(' · ');

  let fieldIndex = -1;

  return (
    <div className="page">
      <PageHeader
        icon={
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
            {entry.patientName.slice(0, 1).toUpperCase()}
          </span>
        }
        title={entry.testName}
        subtitle={`${entry.patientName} · ${meta}`}
        back={{ href: '/lab', label: t('result.back') }}
      />

      {!editable && <p className="note-warn">{t('result.notEditable')}</p>}

      {entry.notes && (
        <div className="flex items-start gap-2.5 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info-text">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">{t('reception.notes')}</div>
            <p className="whitespace-pre-wrap break-words">{entry.notes}</p>
          </div>
        </div>
      )}

      {entry.outsourcedTo && (
        <OutsourcePanel entry={entry} />
      )}

      {(entry.bookingRemarks || entry.attachments.length > 0) && (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          {entry.bookingRemarks && (
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-subtle">{t('result.bookingNote')}</div>
              <p className="text-body">{entry.bookingRemarks}</p>
            </div>
          )}
          {entry.attachments.length > 0 && (
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-subtle">{t('result.attachments')}</div>
              <ul className="flex flex-wrap gap-x-3">
                {entry.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="font-medium text-brand-700 hover:underline dark:text-brand-300">{a.fileName}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {criticalCount > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger-text" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t('result.criticalWarn')}
        </p>
      )}

      <div className="card overflow-hidden">
        {/* Column headings from tablet width up; a phone gets one card per value. */}
        <div className="hidden grid-cols-[minmax(0,1.3fr)_9rem_4.5rem_minmax(0,1.3fr)_6rem_minmax(0,1fr)] gap-x-3 border-b border-line bg-surface-2/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle md:grid">
          <span>{t('result.parameter')}</span>
          <span className="text-end">{t('result.result')}</span>
          <span>{t('result.unit')}</span>
          <span>{t('result.reference')}</span>
          <span>{t('result.flag')}</span>
          <span>{t('result.previous')}</span>
        </div>

        <ul>
          {entry.params.map((p) => {
            const isCalc = p.valueType === 'CALCULATED';
            const isOption = p.valueType === 'OPTION' && !!p.options;
            const r = live.get(p.code);
            const has = r && r.value != null && r.value !== '';
            const out = has && OUT.has(r!.flag);
            if (!isCalc && !isOption) fieldIndex++;
            const myIndex = fieldIndex;

            return (
              <li
                key={p.id}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-3 gap-y-1.5 border-b border-line/70 px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1.3fr)_9rem_4.5rem_minmax(0,1.3fr)_6rem_minmax(0,1fr)]',
                  isCalc && 'bg-brand-500/[0.05]',
                  has && r!.flag === 'CRITICAL' && 'bg-danger-soft/60',
                )}
              >
                <span className={cn('min-w-0 text-sm text-body', p.isBold ? 'font-bold' : 'font-medium')}>
                  {p.name}
                  {isCalc && (
                    <span className="ms-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                      <Lock className="h-3 w-3" /> {t('result.calculated')}
                    </span>
                  )}
                </span>

                <span className="flex items-center justify-end gap-1.5">
                  {isCalc ? (
                    <span className={cn('w-full rounded-xl px-3 py-2.5 text-end font-semibold tabular-nums',
                      has ? (out ? 'text-warn-text' : 'text-strong') : 'text-subtle')}>
                      {has ? r!.value : '—'}
                    </span>
                  ) : isOption ? (
                    <Select
                      value={values[p.code] ?? ''}
                      disabled={!editable}
                      onChange={(val) => setValues((v) => ({ ...v, [p.code]: val }))}
                      placeholder="—"
                      options={p.options!.split(',').map((o) => ({ value: o.trim(), label: o.trim() }))}
                      className="w-full"
                    />
                  ) : (
                    <input
                      ref={(el) => { fields.current[myIndex] = el; }}
                      inputMode={p.valueType === 'NUMBER' || p.valueType === 'CUTOFF' ? 'decimal' : 'text'}
                      enterKeyHint="next"
                      aria-label={p.name}
                      value={values[p.code] ?? ''}
                      disabled={!editable}
                      onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
                      onKeyDown={(e) => onEnter(e, p.code)}
                      autoFocus={myIndex === 0 && editable}
                      className={cn('field py-2 text-end text-base font-semibold tabular-nums',
                        has && r!.flag === 'CRITICAL' && 'border-danger-line text-danger-text',
                        has && (r!.flag === 'HIGH' || r!.flag === 'LOW') && 'border-warn-line text-warn-text')}
                    />
                  )}
                  <span className="w-12 shrink-0 text-xs text-muted md:hidden">{p.unit ?? ''}</span>
                </span>

                <span className="hidden text-sm text-muted md:block">{p.unit ?? '—'}</span>
                <span className="col-span-2 text-xs text-muted md:col-span-1">{p.referenceText || '—'}</span>
                <span className="md:block">
                  {p.valueType === 'CUTOFF' && has ? (
                    <span className={cn('text-xs font-bold uppercase', r!.flag === 'HIGH' ? 'text-danger-text' : 'text-ok-text')}>
                      {interpretCutoff(Number(r!.value), p.cutoff, p.positiveLabel, p.negativeLabel)}
                    </span>
                  ) : has ? (out ? <FlagBadge flag={r!.flag} size="sm" /> : <FlagBadge flag="NORMAL" size="sm" />) : <span className="hidden text-subtle md:inline">—</span>}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted md:justify-start">
                  {p.previous ? (
                    <>
                      <History className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                      <span className={cn('font-semibold tabular-nums', OUT.has(p.previous.flag) ? 'text-warn-text' : 'text-body')}>
                        {p.previous.value}
                      </span>
                      <span className="text-subtle">· {shortDate(p.previous.at)}</span>
                    </>
                  ) : <span className="hidden text-subtle md:inline">—</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Printed on the report under this test — interpretation, a comment on
          the sample, a suggestion to repeat. Booking comments stay internal. */}
      <div className="card p-4">
        <label htmlFor="result-remarks" className="label">{t('result.remarks')}</label>
        <textarea
          id="result-remarks"
          value={remarks}
          disabled={!editable}
          onChange={(e) => setRemarks(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t('result.remarksPlaceholder')}
          className="field resize-y leading-relaxed"
        />
      </div>

      {error && <p className="note-danger"><Tr text={error} /></p>}

      {editable && (
        <SaveBar
          dirty={dirty}
          saving={isPending}
          onSave={() => save()}
          onDiscard={() => { setValues(baseline); setRemarks(savedRemarks); }}
          saveLabel={t('result.save')}
          note={entry.next ? t('result.enterHintNext') : t('result.enterHint')}
          extra={entry.next && (
            <Button variant="outline" onClick={goNext} loading={goingNext} disabled={isPending} className="min-w-0 max-w-full">
              <span className="shrink-0">{dirty ? t('result.saveNext') : t('result.nextTest')}</span>
              <span className="min-w-0 truncate font-normal text-muted">
                {entry.next.testName}{!entry.next.samePatient && ` · ${entry.next.patientName}`}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
            </Button>
          )}
        />
      )}
    </div>
  );
}

/**
 * A test done at a reference lab: say where, and keep their report with ours.
 * The values can still be typed in below so they print on our report.
 */
function OutsourcePanel({ entry }: { entry: EntryDTO }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set('visitId', entry.visitId);
    form.set('orderLineId', entry.orderLineId);
    form.set('kind', 'OUTSOURCE_REPORT');
    form.set('file', file);
    const res = await uploadAttachmentAction(form);
    setUploading(false);
    if (input.current) input.current.value = '';
    if (res.ok) { toast('success', t('attach.uploaded')); router.refresh(); }
    else toast('error', res.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info-line bg-info-soft px-4 py-3 text-sm text-info-text">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t('lab.sentTo').replace('{lab}', entry.outsourcedTo ?? '')}</div>
        {entry.outsourceRef && <div className="text-xs opacity-80">{t('lab.refNo')}: {entry.outsourceRef}</div>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      <Button variant="outline" size="sm" loading={uploading} onClick={() => input.current?.click()}>
        {t('lab.attachRefReport')}
      </Button>
    </div>
  );
}
