'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { formatPkr } from '@/lib/utils';
import { listTestsAction, type TestListDTO } from '@/modules/admin/admin.actions';

export function TestsListClient() {
  const { t } = useI18n();
  const [tests, setTests] = useState<TestListDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTestsAction().then(setTests).catch(() => setTests([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-body">
            <Icon name="dashboard" className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">{t('admin.tests')}</h1>
        </div>
        <Link href="/admin/tests/new"><Button>+ {t('admin.addTest')}</Button></Link>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start font-semibold">{t('admin.name')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('admin.code')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('admin.department')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('admin.parameters')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('admin.price')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-subtle">{t('common.loading')}</td></tr>
            ) : (
              tests.map((t2) => (
                <tr key={t2.id} className="transition-colors odd:bg-surface-2/40 hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-medium text-body">{t2.name}</td>
                  <td className="px-4 py-2.5 text-muted">{t2.code}</td>
                  <td className="px-4 py-2.5 text-muted">{t2.department}</td>
                  <td className="px-4 py-2.5 text-muted">{t2.paramCount}</td>
                  <td className="px-4 py-2.5 text-end font-semibold text-body">{formatPkr(t2.price)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Link href={`/admin/tests/${t2.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                      {t('admin.editTest')}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
