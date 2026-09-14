'use client';

import { useRef, useState, useTransition } from 'react';
import { Upload, Trash2, Info } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { FONT_SCALES, REPORT_FONTS, fontStack } from '@/modules/reporting/layout';
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
        reportShowHeader: v.reportShowHeader,
        reportShowFooter: v.reportShowFooter,
        reportTopMarginMm: v.reportTopMarginMm,
        reportBottomMarginMm: v.reportBottomMarginMm,
        reportFont: v.reportFont,
        reportFontScale: v.reportFontScale,
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
      <Card className="p-6" style={{ fontFamily: fontStack(v.reportFont) }}>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('lh.preview')}</div>
        {!v.reportShowHeader && <p className="mb-3 rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-subtle">{t('lh.headerOffPreview')}</p>}
        <div className={cn(!v.reportShowHeader && 'hidden')}>
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
        </div>
        {v.reportShowFooter && (
          <p className="mt-4 text-center text-[10px] text-subtle">
            {v.reportFooterNote || t('report.footer')}
          </p>
        )}
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

      <Card className="p-5">
        <SectionHeading accent={ACCENT.violet}>{t('lh.layout')}</SectionHeading>
        <p className="mt-1 text-xs text-subtle">{t('lh.layoutHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Switch label={t('lh.showHeader')} hint={v.reportShowHeader ? t('lh.showHeaderOn') : t('lh.showHeaderOff')} on={v.reportShowHeader} onChange={(on) => setV({ ...v, reportShowHeader: on })} />
          <Switch label={t('lh.showFooter')} hint={v.reportShowFooter ? t('lh.showFooterOn') : t('lh.showFooterOff')} on={v.reportShowFooter} onChange={(on) => setV({ ...v, reportShowFooter: on })} />
          <div>
            <label className="label" htmlFor="lh-top">{t('lh.topMargin')}</label>
            <MmInput id="lh-top" value={v.reportTopMarginMm} onChange={(n) => setV({ ...v, reportTopMarginMm: n })} />
          </div>
          <div>
            <label className="label" htmlFor="lh-bottom">{t('lh.bottomMargin')}</label>
            <MmInput id="lh-bottom" value={v.reportBottomMarginMm} onChange={(n) => setV({ ...v, reportBottomMarginMm: n })} />
          </div>
          <div>
            <span className="label">{t('lh.font')}</span>
            <Select
              value={v.reportFont}
              onChange={(f) => setV({ ...v, reportFont: f as (typeof REPORT_FONTS)[number] })}
              options={REPORT_FONTS.map((f) => ({ value: f, label: t(`lh.font.${f}`) }))}
            />
          </div>
          <div>
            <span className="label">{t('lh.size')}</span>
            <Select
              value={String(v.reportFontScale)}
              onChange={(s) => setV({ ...v, reportFontScale: Number(s) })}
              options={FONT_SCALES.map((s) => ({ value: String(s), label: t(`lh.size.${s}`) }))}
            />
          </div>
        </div>
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

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-body">{label}</p>
        <p className="mt-0.5 text-xs text-subtle">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand-500' : 'bg-surface-3 ring-1 ring-inset ring-line')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'start-[22px]' : 'start-0.5')} />
      </button>
    </div>
  );
}

function MmInput({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        min={5}
        max={80}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.min(80, Math.max(5, Math.round(Number(e.target.value) || 5))))}
        className="field pe-12 tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3.5 text-sm font-semibold text-subtle">mm</span>
    </div>
  );
}
