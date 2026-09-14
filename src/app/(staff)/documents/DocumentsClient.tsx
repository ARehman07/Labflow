'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, FilePlus2, FileText, Paperclip, Search, Settings2, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import { DOCUMENT_TYPES } from '@/modules/documents/templates';
import {
  createDocumentAction,
  getDocumentPatientAction,
  listDocumentsAction,
  searchDocumentPatientsAction,
  type DocTemplateDTO,
  type DocumentRowDTO,
  type PatientPickDTO,
} from '@/modules/documents/documents.actions';

/**
 * Patient forms and documents: consents, certificates and letters the lab
 * prints, numbered, with how often each was printed and whether the signed
 * paper has been scanned back.
 */
export function DocumentsClient({
  canManage, canTemplates, templates, initial,
}: { canManage: boolean; canTemplates: boolean; templates: DocTemplateDTO[]; initial: DocumentRowDTO[] }) {
  const { t } = useI18n();
  const params = useSearchParams();
  const presetPatient = params.get('patient');
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(Boolean(presetPatient) && canManage);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const id = setTimeout(() => {
      setLoading(true);
      listDocumentsAction({ q, type, status }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q, type, status]);

  return (
    <div className="page">
      <PageHeader
        title={t('doc.title')}
        subtitle={t('doc.subtitle')}
        actions={
          <>
            {canTemplates && (
              <Link href="/admin/document-templates" className={buttonVariants({ variant: 'outline' })}>
                <Settings2 className="h-4 w-4" /> {t('doc.manageForms')}
              </Link>
            )}
            {canManage && (
              <Button onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
                <FilePlus2 className="h-4 w-4" /> {t('doc.new')}
              </Button>
            )}
          </>
        }
      />

      {creating && <NewDocument templates={templates} presetPatientId={presetPatient} canTemplates={canTemplates} onClose={() => setCreating(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('doc.search')} aria-label={t('doc.search')} className="field ps-10" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={type} onChange={setType} options={[{ value: '', label: t('doc.anyType') }, ...DOCUMENT_TYPES.map((x) => ({ value: x, label: t(`doc.type.${x}`) }))]} />
        </div>
        <div className="w-full sm:w-40">
          <Select value={status} onChange={setStatus} options={[{ value: '', label: t('doc.anyStatus') }, { value: 'DRAFT', label: t('doc.status.DRAFT') }, { value: 'FINAL', label: t('doc.status.FINAL') }]} />
        </div>
      </div>

      <Card className={cn('overflow-hidden p-0 transition-opacity', loading && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
                <th className="px-4 py-2.5 text-start font-semibold">{t('doc.no')}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{t('doc.docTitle')}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{t('reception.patient')}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{t('doc.typeCol')}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{t('doc.statusCol')}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{t('doc.created')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">{t('doc.prints')}</th>
                <th className="w-10 px-2 py-2.5"><span className="sr-only">{t('doc.open')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FileText className="mx-auto mb-2 h-6 w-6 text-subtle" />
                    <p className="text-muted">{q || type || status ? t('doc.noMatch') : t('doc.empty')}</p>
                  </td>
                </tr>
              ) : rows.map((d) => (
                <tr key={d.id} className="group border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-muted">{d.docNo}</td>
                  <td className="px-3 py-3">
                    <Link href={`/documents/${d.id}`} className="font-medium text-strong hover:underline">{d.title}</Link>
                    {d.hasScan && <Paperclip className="ms-1.5 inline h-3.5 w-3.5 text-subtle" aria-label={t('doc.hasScan')} />}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/patients/${d.patientId}`} className="text-body hover:underline">{d.patient}</Link>
                    <div className="font-mono text-[11px] text-subtle">{d.mrNo}</div>
                  </td>
                  <td className="px-3 py-3 text-muted">{t(`doc.type.${d.type}`)}</td>
                  <td className="px-3 py-3"><Badge tone={d.status === 'FINAL' ? 'success' : 'warning'} dot>{t(`doc.status.${d.status}`)}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{d.created}</td>
                  <td className="px-3 py-3 text-end tabular-nums text-muted">{d.prints}</td>
                  <td className="px-2 py-3 text-end">
                    <Link href={`/documents/${d.id}`} aria-label={t('doc.open')}><ChevronRight className="inline h-4 w-4 text-subtle group-hover:text-body rtl:rotate-180" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {rows.length >= 200 && <p className="text-xs text-subtle">{t('doc.capped')}</p>}
    </div>
  );
}

function NewDocument({
  templates, presetPatientId, canTemplates, onClose,
}: { templates: DocTemplateDTO[]; presetPatientId: string | null; canTemplates: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PatientPickDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<PatientPickDTO | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (presetPatientId) getDocumentPatientAction(presetPatientId).then((p) => p && setPatient(p)).catch(() => {});
  }, [presetPatientId]);

  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return; }
    setSearching(true);
    const id = setTimeout(() => {
      searchDocumentPatientsAction(query).then(setFound).catch(() => setFound([])).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  function create() {
    if (!patient) return;
    setError(null);
    start(async () => {
      const res = await createDocumentAction({ patientId: patient.id, templateId: templateId || null, title: templateId ? null : title });
      if (res.ok) router.push(`/documents/${res.id}`);
      else setError(res.error);
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-strong">{t('doc.new')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('doc.newHint')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-strong">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <span className="label">{t('reception.patient')}</span>
          {patient ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-strong">{patient.fullName}</div>
                <div className="font-mono text-xs text-subtle">{patient.mrNo}{patient.mobile ? ` · ${patient.mobile}` : ''}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setPatient(null); setQuery(''); }}>{t('reception.change')}</Button>
            </div>
          ) : (
            <Combobox
              query={query}
              onQueryChange={setQuery}
              items={found.map((p) => ({ id: p.id, label: p.fullName, sublabel: [p.mrNo, p.mobile].filter(Boolean).join(' · ') }))}
              onSelect={(item) => { const p = found.find((x) => x.id === item.id); if (p) setPatient(p); }}
              placeholder={t('reception.searchPatient')}
              loading={searching}
              emptyText={t('doc.noPatient')}
              minChars={2}
            />
          )}
        </div>
        <div>
          <span className="label">{t('doc.form')}</span>
          <Select
            value={templateId}
            onChange={setTemplateId}
            options={[...templates.map((x) => ({ value: x.id, label: x.title })), { value: '', label: t('doc.blank') }]}
          />
          {templates.length === 0 && (
            <p className="mt-1 text-xs text-subtle">
              {t('doc.noForms')}{' '}
              {canTemplates && <Link href="/admin/document-templates" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{t('doc.manageForms')}</Link>}
            </p>
          )}
        </div>
        {!templateId && (
          <div className="md:col-span-2">
            <label className="label" htmlFor="doc-title">{t('doc.docTitle')}</label>
            <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('doc.titleHint')} className="field" />
          </div>
        )}
      </div>

      {error && <p className="note-danger"><Tr text={error} /></p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={create} loading={pending} disabled={!patient || (!templateId && title.trim().length < 3)}>
          <FilePlus2 className="h-4 w-4" /> {t('doc.create')}
        </Button>
      </div>
    </Card>
  );
}
