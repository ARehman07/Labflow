'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  getApprovalsAction,
  approveAction,
  sendBackAction,
  type ApprovalDTO,
} from '@/modules/lab/lab.actions';

export function ApprovalsClient() {
  const { t } = useI18n();
  const [items, setItems] = useState<ApprovalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    getApprovalsAction()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  function approve(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await approveAction(id);
      if (res.ok) load();
      else setError(res.error);
    });
  }
  function sendBack(id: string) {
    startTransition(async () => {
      const res = await sendBackAction(id);
      if (res.ok) load();
      else setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-strong">{t('approvals.title')}</h1>
        <Link href="/lab">
          <Button variant="ghost">← {t('lab.title')}</Button>
        </Link>
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}

      {loading ? (
        <p className="text-subtle">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-surface-2 p-6 text-center text-subtle">{t('approvals.none')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.orderLineId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <div>
                <div className="font-semibold text-strong">{it.testName}</div>
                <div className="text-sm text-muted">
                  {it.patientName} · {it.mrNo}
                  {it.enteredBy && ` · ${t('approvals.enteredBy')}: ${it.enteredBy}`}
                  {it.abnormal > 0 && <span className="ms-2 pill bg-red-100 text-danger-text">⚠ {it.abnormal}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/lab/result/${it.orderLineId}`}>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs">{t('approvals.view')}</Button>
                </Link>
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => sendBack(it.orderLineId)}>
                  ↩ {t('approvals.sendBack')}
                </Button>
                <Button className="px-3 py-1.5 text-xs" onClick={() => approve(it.orderLineId)}>
                  ✅ {t('approvals.approve')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
