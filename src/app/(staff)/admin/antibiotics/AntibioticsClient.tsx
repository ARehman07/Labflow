'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import {
  addAntibioticAction,
  listAntibioticsAction,
  setAntibioticActiveAction,
  type AntibioticDTO,
} from '@/modules/antibiotics/antibiotics.actions';

/** The antibiotic panel offered when a culture's sensitivity is entered. */
export function AntibioticsClient({ initial }: { initial: AntibioticDTO[] }) {
  const { t } = useI18n();
  const [list, setList] = useState(initial);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reload = () => listAntibioticsAction(true).then(setList);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addAntibioticAction(name);
      if (res.ok) { setName(''); await reload(); }
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader title={t('abx.title')} subtitle={t('abx.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />
      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) add(); }}
            placeholder={t('abx.placeholder')}
            aria-label={t('abx.placeholder')}
            className="field min-w-0 flex-1"
          />
          <Button onClick={add} loading={isPending} disabled={name.trim().length < 2}><Plus className="h-4 w-4" /> {t('abx.add')}</Button>
        </div>
        {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
      </Card>
      <Card className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.isActive ? t('abx.hide') : t('abx.show')}
              onClick={async () => { await setAntibioticActiveAction(a.id, !a.isActive); await reload(); }}
              className={cn('rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                a.isActive ? 'border-line bg-surface text-body hover:border-danger-line' : 'border-dashed border-line text-subtle line-through hover:text-body')}
            >
              {a.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-subtle">{t('abx.toggleHint')}</p>
      </Card>
    </div>
  );
}
