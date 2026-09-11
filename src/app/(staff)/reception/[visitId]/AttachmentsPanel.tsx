'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToast } from '@/components/ui/Toast';
import {
  deleteAttachmentAction,
  listAttachmentsAction,
  uploadAttachmentAction,
  type AttachmentDTO,
} from '@/modules/attachments/attachments.actions';

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Files that came with the patient: the doctor's prescription, a referral
 * letter, an earlier report from another lab. Attached to the booking so the
 * bench can open them from the result screen.
 */
export function AttachmentsPanel({ visitId, canAttach, canDelete }: { visitId: string; canAttach: boolean; canDelete: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [files, setFiles] = useState<AttachmentDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = () => listAttachmentsAction(visitId).then(setFiles).catch(() => setFiles([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [visitId]);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.set('visitId', visitId);
      form.set('file', file);
      const res = await uploadAttachmentAction(form);
      if (res.ok) toast('success', t('attach.uploaded'));
      else toast('error', res.error);
    }
    setUploading(false);
    if (input.current) input.current.value = '';
    await load();
  }

  async function remove(id: string) {
    const res = await deleteAttachmentAction(id);
    if (res.ok) { toast('success', t('attach.removed')); await load(); }
    else toast('error', res.error);
  }

  if (!canAttach && files.length === 0) return null;

  return (
    <section className="no-print card p-4" aria-labelledby="attach-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="attach-title" className="flex items-center gap-1.5 font-semibold text-strong">
          <Paperclip className="h-4 w-4" /> {t('attach.title')}
        </h2>
        {canAttach && (
          <>
            <input
              ref={input}
              id="attach-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
            />
            <Button variant="outline" size="sm" loading={uploading} onClick={() => input.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" /> {t('attach.add')}
            </Button>
          </>
        )}
      </div>
      {canAttach && <p className="mt-1 text-xs text-subtle">{t('attach.hint')}</p>}
      {files.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('attach.none')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {files.map((f) => {
            const Icon = f.mimeType === 'application/pdf' ? FileText : ImageIcon;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-subtle" />
                <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                  {f.fileName}
                </a>
                <span className="shrink-0 text-xs tabular-nums text-subtle">{kb(f.size)}</span>
                {canDelete && (
                  <ConfirmButton onConfirm={() => remove(f.id)} prompt={t('attach.removePrompt')} confirmLabel={t('attach.remove')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
