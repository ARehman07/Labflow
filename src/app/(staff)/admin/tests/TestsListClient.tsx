'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, FlaskConical, Plus, Search } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { formatPkr } from '@/lib/utils';
import { listTestsAction, type TestListDTO } from '@/modules/admin/admin.actions';

/**
 * The test catalogue. Searchable, because a lab's list runs to hundreds of
 * tests; and a whole row opens the test, because a small "Edit" link at the far
 * end of a wide table was the only target.
 */
export function TestsListClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [tests, setTests] = useState<TestListDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    listTestsAction().then(setTests).catch(() => setTests([])).finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tests;
    return tests.filter((x) =>
      x.name.toLowerCase().includes(s) || x.code.toLowerCase().includes(s) || (x.department ?? '').toLowerCase().includes(s));
  }, [tests, q]);

  return (
    <div className="page">
      <PageHeader
        title={t('admin.tests')}
        back={{ href: '/admin', label: t('admin.title') }}
        actions={
          <Link href="/admin/tests/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" /> {t('admin.addTest')}
          </Link>
        }
      />

      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('tests.search')}
          className="field ps-10"
          autoComplete="off"
        />
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle">
            <FlaskConical className="h-6 w-6" />
          </span>
          <p className="text-muted">{q ? t('tests.none') : t('entity.empty')}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-subtle">
                  <th className="px-4 py-2.5 text-start font-semibold">{t('admin.name')}</th>
                  <th className="px-4 py-2.5 text-start font-semibold">{t('admin.code')}</th>
                  <th className="px-4 py-2.5 text-start font-semibold">{t('admin.department')}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t('admin.parameters')}</th>
                  <th className="px-4 py-2.5 text-end font-semibold">{t('admin.price')}</th>
                  <th className="w-10 px-2 py-2.5"><span className="sr-only">{t('admin.editTest')}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr
                    key={x.id}
                    onClick={() => router.push(`/admin/tests/${x.id}`)}
                    className="group cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 font-medium text-strong">
                      <Link href={`/admin/tests/${x.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {x.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{x.code}</td>
                    <td className="px-4 py-3 text-muted">{x.department}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-muted">{x.paramCount}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-body">{formatPkr(x.price)}</td>
                    <td className="px-2 py-3 text-end">
                      <ChevronRight className="inline h-4 w-4 text-subtle transition-colors group-hover:text-body rtl:rotate-180" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
