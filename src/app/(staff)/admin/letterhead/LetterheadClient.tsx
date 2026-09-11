'use client';

import { useRef, useState, useTransition } from 'react';
import { Upload, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { Letterhead } from '@/components/report/Letterhead';
import { QrCode } from '@/components/ui/QrCode';
import { updateLetterheadAction, type LabLetterhead } from '@/modules/settings/settings.actions';
import { MAX_LOGO_BYTES } from '@/modules/settings/settings.schema';
import { SaveBar } from '@/components/ui/SaveBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Tr } from '@/components/ui/Tr';

/**
 * What every printed report and slip is headed with.
 *
 * The live preview is the point: these fields are only ever seen on paper, so
 * editing them blind means printing to find out what you got.
 */
export function LetterheadClient({ initial }: { initial: LabLetterhead }) {
  const { t } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  function pickLogo(file: File) {
    setError(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      setError(t('lh.badType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      // Checked here as well as on the server so the person gets told before
      // a 4 MB upload travels anywhere.
      if (url.length > MAX_LOGO_BYTES) {
        setError(t('lh.tooLarge'));
        return;
      }
      setV((s) => ({ ...s, logoDataUrl: url }));
    };
    reader.readAsDataURL(file);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateLetterheadAction({
        name: v.name,
        tagline: v.tagline ?? '',
        licenseNo: v.licenseNo ?? '',
        email: v.email ?? '',
        logoDataUrl: v.logoDataUrl ?? '',
        reportFooterNote: v.reportFooterNote ?? '',
      });
      if (res.ok) { setV(res.letterhead); setSaved(res.letterhead); toast('success', t('lh.updated')); }
      else { setError(res.error); toast('error', res.error); }
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('lh.title')}
        subtitle={t('lh.subtitle')}
        back={{ href: '/admin', label: t('admin.title') }}
      />

      {/* Preview first — this is the thing being edited. */}
      <Card className="p-6">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('lh.preview')}</div>
        <Letterhead
          data={{
            labName: v.name || t('lh.yourLab'),
            tagline: v.tagline ?? null,
            logoDataUrl: v.logoDataUrl ?? null,
            licenseNo: v.licenseNo ?? null,
            email: v.email ?? null,
            footerNote: null,
            branchName: v.branchName ?? t('lh.mainBranch'),
            branchAddress: v.branchAddress,
            branchPhone: v.branchPhone,
          }}
          docLabel={t('report.title')}
          docNumber="00123"
          right={<QrCode value="LabFlow|preview" size={64} />}
        />
        <p className="mt-4 text-center text-[10px] text-subtle">
          {v.reportFooterNote || t('report.footer')}
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.brand}>{t('lh.identity')}</SectionHeading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="lh-name">{t('lh.name')}</label>
            <input id="lh-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="field" />
            <p className="mt-1 text-xs text-subtle">{t('lh.nameHint')}</p>
          </div>
          <div>
            <label className="label" htmlFor="lh-tagline">{t('lh.tagline')}</label>
            <input
              id="lh-tagline"
              value={v.tagline ?? ''}
              onChange={(e) => setV({ ...v, tagline: e.target.value })}
              placeholder={t('lh.taglinePlaceholder')}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="lh-license">{t('lh.license')}</label>
            <input
              id="lh-license"
              value={v.licenseNo ?? ''}
              onChange={(e) => setV({ ...v, licenseNo: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="lh-email">{t('lh.email')}</label>
            <input
              id="lh-email"
              type="email"
              value={v.email ?? ''}
              onChange={(e) => setV({ ...v, email: e.target.value })}
              className="field"
            />
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          {t('lh.addressNote')}
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.brand}>{t('lh.logo')}</SectionHeading>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-2">
            {v.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL, not a remote asset
              <img src={v.logoDataUrl} alt={t('lh.logoAlt')} className="h-16 w-16 object-contain" />
            ) : (
              <span className="text-[11px] text-subtle">{t('lh.noLogo')}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); e.target.value = ''; }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {v.logoDataUrl ? t('lh.replace') : t('lh.upload')}
            </Button>
            {v.logoDataUrl && (
              <Button variant="ghost" onClick={() => setV({ ...v, logoDataUrl: undefined })}>
                <Trash2 className="h-4 w-4" /> {t('lh.remove')}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-subtle">
          {t('lh.logoHint')}
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.neutral}>{t('lh.footer')}</SectionHeading>
        <label className="label mt-3" htmlFor="lh-footer">{t('lh.footerLabel')}</label>
        <textarea
          id="lh-footer"
          value={v.reportFooterNote ?? ''}
          onChange={(e) => setV({ ...v, reportFooterNote: e.target.value })}
          rows={2}
          placeholder={t('report.footer')}
          className="field"
        />
      </Card>

      {error && <p className="note-danger"><Tr text={error} /></p>}

      <SaveBar
        dirty={dirty}
        saving={isPending}
        onSave={save}
        onDiscard={() => setV(saved)}
        disabled={v.name.trim().length < 2}
        saveLabel={t('lh.save')}
        note={t('lh.subtitle')}
      />
    </div>
  );
}
