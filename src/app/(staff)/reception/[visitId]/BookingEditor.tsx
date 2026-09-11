'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Plus, Undo2, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Combobox, type ComboItem } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn, formatPkr } from '@/lib/utils';
import { rebill } from '@/modules/billing/rebill';
import {
  searchTestsAction,
  modifyBookingAction,
  cancelBookingAction,
} from '@/modules/reception/reception.actions';
import type { TestListItem } from '@/modules/catalog/catalog.service';
import type { SlipData } from './SlipView';

/** Nothing has been drawn for these, so they can still come off. */
const REMOVABLE = new Set(['BOOKED', 'RETAKE']);

/**
 * Change a booking after its slip is printed.
 *
 * The counter's real cases: the doctor rang to add a test, the patient
 * decided against one, or they left before giving a sample. Before this the
 * only way out was a new booking beside the wrong one, with two invoices and
 * two tokens for one person.
 *
 * Changes are staged here and previewed — new total, and what that means for
 * money already taken — then saved together.
 */
export function BookingEditor({ data, onClose }: { data: SlipData; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<TestListItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TestListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(data.notes ?? '');
  const [saving, startSave] = useTransition();
  const [cancelling, startCancel] = useTransition();

  const deb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(deb.current);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    deb.current = setTimeout(() => {
      searchTestsAction(query).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [query]);

  const onBooking = new Set(data.lines.filter((l) => !removed.has(l.id)).map((l) => l.testId));
  const items: ComboItem[] = results
    .filter((r) => !onBooking.has(r.id) && !added.some((a) => a.id === r.id))
    .map((r) => ({ id: r.id, label: r.name, sublabel: r.departmentName, right: formatPkr(r.price) }));

  const toggle = (id: string) => setRemoved((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const newGross = data.gross
    - data.lines.filter((l) => removed.has(l.id)).reduce((s, l) => s + l.price, 0)
    + added.reduce((s, a) => s + a.price, 0);
  const preview = rebill({
    gross: data.gross, discount: data.discount, source: data.discountSource, cardFee: data.cardFee, newGross,
  });
  const testsChanged = removed.size > 0 || added.length > 0;
  const notesChanged = notes.trim() !== (data.notes ?? '');
  const changed = testsChanged || notesChanged;
  const remaining = data.lines.length - removed.size + added.length;
  const owed = preview.net - data.paid;
  const canCancelAll = data.lines.every((l) => REMOVABLE.has(l.status));

  function save() {
    setError(null);
    startSave(async () => {
      const res = await modifyBookingAction({
        visitId: data.visitId,
        addTestIds: added.map((a) => a.id),
        removeLineIds: [...removed],
        notes: notesChanged ? (notes.trim() || null) : undefined,
      });
      if (res.ok) { toast('success', t('edit.saved')); onClose(); router.refresh(); }
      else setError(res.error);
    });
  }

  function cancelBooking() {
    setError(null);
    startCancel(async () => {
      const res = await cancelBookingAction(data.visitId);
      if (res.ok) {
        toast('success', res.refundDue > 0
          ? t('edit.cancelledRefund').replace('{amount}', formatPkr(res.refundDue))
          : t('edit.cancelled'));
        onClose();
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <section className="no-print card animate-fade-in-up space-y-4 p-4 sm:p-5" aria-labelledby="edit-booking">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="edit-booking" className="font-bold text-strong">{t('edit.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('edit.subtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.cancel')}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {data.can.modify && (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {data.lines.map((l) => {
              const off = removed.has(l.id);
              const removable = REMOVABLE.has(l.status);
              return (
                <li key={l.id} className={cn('flex items-center gap-3 px-3.5 py-2.5', off && 'bg-danger-soft/40')}>
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm font-semibold', off ? 'text-subtle line-through' : 'text-body')}>{l.name}</div>
                    <div className={cn('text-xs', off ? 'font-semibold text-danger-text' : 'text-subtle')}>
                      {off ? t('edit.willRemove') : removable ? t(`status.${l.status}`) : t('edit.sampleTaken')}
                    </div>
                  </div>
                  <span className={cn('shrink-0 text-sm tabular-nums', off ? 'text-subtle line-through' : 'text-muted')}>
                    {formatPkr(l.price)}
                  </span>
                  {removable && (
                    <Button variant="ghost" size="sm" onClick={() => toggle(l.id)} className={off ? undefined : 'text-danger-text'}>
                      {off ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {off ? t('lab.undo') : t('common.remove')}
                    </Button>
                  )}
                </li>
              );
            })}
            {added.map((a) => (
              <li key={a.id} className="flex items-center gap-3 bg-ok-soft/50 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-body">{a.name}</div>
                  <div className="text-xs font-semibold text-ok-text">{t('edit.willAdd')}</div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted">{formatPkr(a.price)}</span>
                <Button variant="ghost" size="sm" onClick={() => setAdded((x) => x.filter((y) => y.id !== a.id))}>
                  <X className="h-3.5 w-3.5" /> {t('common.remove')}
                </Button>
              </li>
            ))}
          </ul>

          <Combobox
            query={query}
            onQueryChange={setQuery}
            items={items}
            onSelect={(it) => {
              const tst = results.find((r) => r.id === it.id);
              if (tst) setAdded((a) => [...a, tst]);
              setQuery('');
            }}
            placeholder={t('edit.addTest')}
            loading={searching}
            emptyText={t('reception.noResults')}
            leftIcon={<Plus className="h-4 w-4" />}
          />

          <div>
            <label htmlFor="edit-notes" className="label">{t('reception.notes')}</label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t('reception.notesPlaceholder')}
              className="field resize-y leading-relaxed"
            />
          </div>
        </>
      )}

      {testsChanged && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-3.5 text-sm">
          <Change label={t('slip.gross')} from={data.gross} to={preview.gross} />
          {(data.discount > 0 || preview.discount > 0) && (
            <Change label={t('slip.discount')} from={data.discount} to={preview.discount} minus />
          )}
          {data.cardFee > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('reception.cardFee')}</span>
              <span className="tabular-nums">+ {formatPkr(data.cardFee)}</span>
            </div>
          )}
          <Change label={t('slip.net')} from={data.net} to={preview.net} strong />
          {data.paid > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t('edit.alreadyPaid')}</span>
              <span className="tabular-nums">{formatPkr(data.paid)}</span>
            </div>
          )}
          {data.paid > 0 && owed > 0 && (
            <p className="pt-1 font-semibold text-warn-text">{t('edit.toCollect').replace('{amount}', formatPkr(owed))}</p>
          )}
          {owed < 0 && (
            <p className="pt-1 font-semibold text-danger-text">{t('edit.toRefund').replace('{amount}', formatPkr(-owed))}</p>
          )}
        </div>
      )}

      {data.can.modify && remaining === 0 && <p className="note-warn">{t('edit.removeAllHint')}</p>}
      {error && <p className="note-danger"><Tr text={error} /></p>}

      <div className="flex flex-wrap items-center gap-2">
        {data.can.modify && (
          <Button onClick={save} loading={saving} disabled={!changed || remaining === 0 || cancelling}>
            {t('edit.save')}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <span className="flex-1" />
        {data.can.cancel && (
          canCancelAll ? (
            <ConfirmButton
              onConfirm={cancelBooking}
              loading={cancelling}
              disabled={saving}
              prompt={t('edit.cancelPrompt')}
              confirmLabel={t('edit.cancelYes')}
              className="text-danger-text"
            >
              <Ban className="h-4 w-4" /> {t('edit.cancelBooking')}
            </ConfirmButton>
          ) : (
            <span className="text-xs text-subtle">{t('edit.cannotCancel')}</span>
          )
        )}
      </div>
    </section>
  );
}

function Change({ label, from, to, strong, minus }: { label: string; from: number; to: number; strong?: boolean; minus?: boolean }) {
  const fmt = (n: number) => `${minus ? '− ' : ''}${formatPkr(n)}`;
  return (
    <div className={cn('flex justify-between gap-2', strong ? 'border-t border-line pt-1.5 font-bold text-strong' : 'text-muted')}>
      <span>{label}</span>
      <span className="tabular-nums">
        {from !== to && <span className="me-2 font-normal text-subtle line-through">{fmt(from)}</span>}
        {fmt(to)}
      </span>
    </div>
  );
}
