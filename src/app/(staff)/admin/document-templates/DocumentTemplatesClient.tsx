'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, FileText, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import { DOCUMENT_TYPES, DOCUMENT_VARS, fillDocument, type DocumentType } from '@/modules/documents/templates';
import { addStarterTemplatesAction, saveDocumentTemplateAction, type DocTemplateDTO } from '@/modules/documents/documents.actions';

type Draft = { id: string | null; title: string; type: DocumentType; body: string; isActive: boolean };

/** The forms the lab prints, worded once with placeholders the patient's details fill in. */
export function DocumentTemplatesClient({ initial, labName }: { initial: DocTemplateDTO[]; labName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [adding, startAdd] = useTransition();

  const sample = useMemo(() => ({
    patient: 'Ayesha Khan', mr: 'MR-000045', age: '34 years', sex: 'Female', mobile: '03001234567', cnic: '35202-1234567-8',
    address: 'Kohinoor City, Faisalabad', date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
    lab: labName, slip: '00123', doctor: 'Dr. Imran', tests: 'CBC, Lipid Profile',
  }), [labName]);

  function save() {
    if (!draft) return;
    setError(null);
    startSave(async () => {
      const res = await saveDocumentTemplateAction(draft.id, { title: draft.title, type: draft.type, body: draft.body, isActive: draft.isActive });
      if (res.ok) { toast('success', t('dt.saved')); setDraft(null); router.refresh(); } else setError(res.error);
    });
  }

  function addStarters() {
    startAdd(async () => {
      const res = await addStarterTemplatesAction();
      toast('success', t('dt.startersAdded').replace('{n}', String(res.added)));
      router.refresh();
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('dt.title')}
        subtitle={t('dt.subtitle')}
        back={{ href: '/admin', label: t('admin.title') }}
        actions={
          <>
            <Button variant="outline" onClick={addStarters} loading={adding}><Sparkles className="h-4 w-4" /> {t('dt.starters')}</Button>
            <Button onClick={() => { setError(null); setDraft({ id: null, title: '', type: 'CONSENT', body: '', isActive: true }); }}>
              <FilePlus2 className="h-4 w-4" /> {t('dt.new')}
            </Button>
          </>
        }
      />

      {draft && (
        <Card className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold text-strong">{draft.id ? t('dt.edit') : t('dt.new')}</h2>
            <button type="button" onClick={() => setDraft(null)} aria-label={t('common.cancel')} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-strong">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="dt-title">{t('doc.docTitle')}</label>
              <input id="dt-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} className="field" />
            </div>
            <div>
              <span className="label">{t('doc.typeCol')}</span>
              <Select value={draft.type} onChange={(v) => setDraft({ ...draft, type: v as DocumentType })} options={DOCUMENT_TYPES.map((x) => ({ value: x, label: t(`doc.type.${x}`) }))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="dt-body">{t('doc.text')}</label>
            <textarea id="dt-body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={9} maxLength={8000} className="field min-h-[11rem] resize-y leading-relaxed" />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-subtle">{t('msg.placeholders')}</span>
              {DOCUMENT_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft({ ...draft, body: `${draft.body}${draft.body === '' || /\s$/u.test(draft.body) ? '' : ' '}{${v}}` })}
                  className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-body transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('msg.preview')}</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-body">{fillDocument(draft.body, sample) || '—'}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 accent-brand-600" />
            {t('dt.active')}
          </label>
          {error && <p className="note-danger"><Tr text={error} /></p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} loading={saving} disabled={draft.title.trim().length < 3 || draft.body.trim().length < 10}>{t('dt.save')}</Button>
          </div>
        </Card>
      )}

      {initial.length === 0 && !draft ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-subtle"><FileText className="h-6 w-6" /></span>
          <p className="text-muted">{t('dt.empty')}</p>
          <Button variant="outline" onClick={addStarters} loading={adding}><Sparkles className="h-4 w-4" /> {t('dt.starters')}</Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {initial.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => { setError(null); setDraft({ id: x.id, title: x.title, type: x.type as DocumentType, body: x.body, isActive: x.isActive }); }}
              className={cn('card card-hover p-4 text-start', !x.isActive && 'opacity-60')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-strong">{x.title}</div>
                  <div className="text-xs text-subtle">{t(`doc.type.${x.type}`)} · {t('dt.used').replace('{n}', String(x.used))}</div>
                </div>
                {!x.isActive && <Badge tone="neutral" size="sm">{t('dt.inactive')}</Badge>}
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{x.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
