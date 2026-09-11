'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { BellRing } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  getNotifiableReportsAction,
  recordNotifiableFilingAction,
  type NotifiableDTO,
} from '@/modules/lab/lab.actions';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Tr } from '@/components/ui/Tr';

export function NotifiableClient() {
  const { t } = useI18n();
  const [items, setItems] = useState<NotifiableDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    getNotifiableReportsAction()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  function submit(id: string, form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await recordNotifiableFilingAction(id, {
        reportedTo: String(data.get('reportedTo') ?? ''),
        referenceNo: String(data.get('referenceNo') ?? '') || undefined,
        notes: String(data.get('notes') ?? '') || undefined,
      });
      if (res.ok) {
        setOpenId(null);
        load();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="page">
      <PageHeader
        icon={<BellRing className="h-6 w-6 text-amber-600" aria-hidden />}
        title={t('notifiable.title')}
        back={{ href: '/lab', label: t('lab.title') }}
      />

      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
        {t('notifiable.intro')}
      </p>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text"><Tr text={error} /></p>}

      {loading ? (
        <ListSkeleton rows={2} />
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-ok-soft p-6 text-center text-ok-text">
          {t('notifiable.none')}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-warn-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-strong">{it.conditionName}</div>
                  <div className="text-sm text-muted">
                    {it.patientName} · MR# {it.mrNo} · {it.testName} · {it.parameterName}
                    {it.value ? `: ${it.value}` : ''}
                  </div>
                </div>
                <div className="text-sm text-muted">
                  {new Date(it.flaggedAt).toLocaleDateString()}
                </div>
              </div>

              {openId === it.id ? (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(it.id, e.currentTarget);
                  }}
                >
                  <label className="text-sm">
                    <span className="label">{t('notifiable.reportedTo')}</span>
                    <input name="reportedTo" required className="field" autoFocus />
                  </label>
                  <label className="text-sm">
                    <span className="label">{t('notifiable.referenceNo')}</span>
                    <input name="referenceNo" className="field" />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="label">{t('notifiable.notes')}</span>
                    <input name="notes" className="field" />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit">{t('notifiable.record')}</Button>
                    <Button type="button" variant="ghost" onClick={() => setOpenId(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-3">
                  <Button onClick={() => setOpenId(it.id)}>{t('notifiable.logFiling')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
