'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Paperclip, Printer, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { Letterhead } from '@/components/report/Letterhead';
import type { Letterhead as LetterheadData } from '@/modules/reporting/report.types';
import {
  deleteDocumentAction,
  finalizeDocumentAction,
  markDocumentPrintedAction,
  removeDocumentScanAction,
  updateDocumentAction,
  uploadDocumentScanAction,
} from '@/modules/documents/documents.actions';

export interface DocumentViewData {
  id: string;
  docNo: number;
  title: string;
  type: string;
  body: string;
  status: string;
  prints: number;
  created: string;
  finalized: string | null;
  createdBy: string | null;
  scan: { fileName: string; mimeType: string; size: number } | null;
  patient: { id: string; fullName: string; mrNo: string; age: number | null; ageUnit: string; sex: string | null; mobile: string | null };
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * One patient document. A draft is edited here with the printed page live
 * beneath it; making it final locks the wording, after which it is printed as
 * often as needed and the signed copy scanned back.
 */
export function DocumentView({ doc, letterhead, canManage }: { doc: DocumentViewData; letterhead: LetterheadData; canManage: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const draft = doc.status === 'DRAFT';
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [finalizing, startFinal] = useTransition();
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dirty = title !== doc.title || body !== doc.body;
  const editable = draft && canManage;

  function save() {
    setError(null);
    startSave(async () => {
      const res = await updateDocumentAction(doc.id, { title, body });
      if (res.ok) { toast('success', t('doc.saved')); router.refresh(); } else setError(res.error);
    });
  }

  function finalize() {
    setError(null);
    startFinal(async () => {
      const res = await finalizeDocumentAction(doc.id);
      if (res.ok) { toast('success', t('doc.finalized')); router.refresh(); } else setError(res.error);
    });
  }

  async function print() {
    if (canManage) await markDocumentPrintedAction(doc.id);
    window.print();
    router.refresh();
  }

  async function remove() {
    const res = await deleteDocumentAction(doc.id);
    if (res.ok) { toast('success', t('doc.deleted')); router.push('/documents'); } else setError(res.error);
  }

  async function upload(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setUploading(true);
    const form = new FormData();
    form.set('id', doc.id);
    form.set('file', f);
    const res = await uploadDocumentScanAction(form);
    setUploading(false);
    if (file.current) file.current.value = '';
    if (res.ok) { toast('success', t('doc.scanAttached')); router.refresh(); } else setError(res.error);
  }

  async function removeScan() {
    const res = await removeDocumentScanAction(doc.id);
    if (res.ok) router.refresh(); else setError(res.error);
  }

  const p = doc.patient;
  const ageSex = [p.age != null ? `${p.age} ${p.ageUnit === 'MONTHS' ? t('modify.months') : p.ageUnit === 'DAYS' ? t('modify.days') : t('common.years')}` : null, p.sex ? t(`reception.${p.sex.toLowerCase()}`) : null].filter(Boolean).join(' / ');

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          title={title || doc.title}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{t('doc.no')} {doc.docNo}</span>
              <Badge tone={draft ? 'warning' : 'success'} dot>{t(`doc.status.${doc.status}`)}</Badge>
              <span>· {t(`doc.type.${doc.type}`)}</span>
              <span>· {t('doc.printedN').replace('{n}', String(doc.prints))}</span>
            </span>
          }
          back={{ href: '/documents', label: t('doc.title') }}
          actions={
            <>
              {editable && (
                <ConfirmButton variant="ghost" size="md" onConfirm={remove} prompt={t('doc.deletePrompt')} confirmLabel={t('doc.deleteYes')}>
                  <Trash2 className="h-4 w-4" /> {t('doc.delete')}
                </ConfirmButton>
              )}
              {editable && (
                <ConfirmButton
                  variant="outline"
                  size="md"
                  tone="primary"
                  onConfirm={finalize}
                  loading={finalizing}
                  disabled={dirty || !body.trim()}
                  prompt={t('doc.finalizePrompt')}
                  confirmLabel={t('doc.finalizeYes')}
                >
                  <CheckCircle2 className="h-4 w-4" /> {t('doc.finalize')}
                </ConfirmButton>
              )}
              <Button onClick={() => void print()} disabled={dirty}>
                <Printer className="h-4 w-4" /> {t('doc.print')}
              </Button>
            </>
          }
        />
      </div>

      {editable && (
        <Card className="no-print space-y-3 p-5">
          <SectionHeading accent={ACCENT.brand}>{t('doc.edit')}</SectionHeading>
          <div>
            <label className="label" htmlFor="doc-edit-title">{t('doc.docTitle')}</label>
            <input id="doc-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="doc-edit-body">{t('doc.text')}</label>
            <textarea id="doc-edit-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} maxLength={8000} className="field min-h-[12rem] resize-y leading-relaxed" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle">{dirty ? t('doc.unsaved') : t('doc.draftHint')}</p>
            <div className="flex gap-2">
              {dirty && <Button variant="ghost" onClick={() => { setTitle(doc.title); setBody(doc.body); }}>{t('common.cancel')}</Button>}
              <Button onClick={save} loading={saving} disabled={!dirty || title.trim().length < 3}>{t('doc.save')}</Button>
            </div>
          </div>
        </Card>
      )}

      {error && <p className="no-print note-danger"><Tr text={error} /></p>}

      <Card className="no-print flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-subtle"><Paperclip className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-strong">{t('doc.scan')}</div>
          {doc.scan ? (
            <a href={`/api/documents/${doc.id}/scan`} target="_blank" rel="noreferrer" className="text-sm text-brand-700 hover:underline dark:text-brand-300">
              {doc.scan.fileName} · {kb(doc.scan.size)}
            </a>
          ) : (
            <p className="text-sm text-muted">{t('doc.scanHint')}</p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => void upload(e.target.files)} />
            <Button variant="outline" size="sm" onClick={() => file.current?.click()} loading={uploading}>
              <Upload className="h-3.5 w-3.5" /> {doc.scan ? t('doc.replaceScan') : t('doc.attachScan')}
            </Button>
            {doc.scan && (
              <ConfirmButton variant="ghost" size="sm" onConfirm={() => void removeScan()} prompt={t('doc.removeScanPrompt')} confirmLabel={t('common.remove')}>
                {t('common.remove')}
              </ConfirmButton>
            )}
          </div>
        )}
      </Card>

      <div className="print-area card p-4 sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <Letterhead data={letterhead} docLabel={title || doc.title} docNumber={String(doc.docNo)} />

        <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg bg-surface-2 px-4 py-3 text-sm print:rounded-none print:border print:border-line print:bg-transparent print:py-2 print:text-[11px]">
          <Field label={t('reception.patient')} value={p.fullName} strong />
          <Field label={t('reception.mrNo')} value={p.mrNo} />
          <Field label={`${t('reception.age')}/${t('reception.sex')}`} value={ageSex || '—'} />
          <Field label={t('reception.mobile')} value={p.mobile ?? '—'} />
          <Field label={t('doc.dated')} value={doc.finalized ?? doc.created} />
          {doc.createdBy && <Field label={t('doc.preparedBy')} value={doc.createdBy} />}
        </section>

        {draft && <p className="mt-4 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-warn-text print:text-amber-700">{t('doc.draftMark')}</p>}

        <div className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-body print:text-[12px]">
          {body || <span className="text-subtle">{t('doc.emptyBody')}</span>}
        </div>

        <div className="mt-16 grid grid-cols-2 gap-10 text-xs text-subtle print:mt-14 print:text-[10px]">
          <div className="border-t border-line-strong pt-1">{t('doc.signPatient')}</div>
          <div className="border-t border-line-strong pt-1 text-end">{t('doc.signLab')}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-subtle">{label}:</span>
      <span className={strong ? 'min-w-0 break-words font-bold text-strong' : 'min-w-0 break-words text-body'}>{value}</span>
    </div>
  );
}
