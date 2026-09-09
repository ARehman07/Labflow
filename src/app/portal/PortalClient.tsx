'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useI18n } from '@/core/i18n/I18nProvider';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthShell } from '@/components/layout/AuthShell';
import { ReportDocument } from '@/components/report/ReportDocument';
import {
  requestOtpAction,
  verifyOtpAction,
  getPortalReportAction,
} from '@/modules/portal/portal.actions';
import type { PortalReportSummary } from '@/modules/portal/portal.service';
import type { ReportData } from '@/modules/reporting/report.types';

type Step = 'MOBILE' | 'OTP' | 'LIST' | 'REPORT';

export function PortalClient() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('MOBILE');
  const [labCode, setLabCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [reports, setReports] = useState<PortalReportSummary[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sendCode = () =>
    startTransition(async () => {
      setError(null);
      const res = await requestOtpAction(labCode, mobile);
      if (!res.ok) return setError(res.error ?? 'Failed');
      setDevCode(res.devCode ?? null);
      setStep('OTP');
    });

  const verify = () =>
    startTransition(async () => {
      setError(null);
      const res = await verifyOtpAction(labCode, mobile, code);
      if (!res.ok || !res.token) return setError(res.error ?? 'Failed');
      setToken(res.token);
      setReports(res.reports ?? []);
      setStep('LIST');
    });

  const openReport = (visitId: string) =>
    startTransition(async () => {
      const data = await getPortalReportAction(token, visitId);
      if (data) { setReport(data); setStep('REPORT'); }
    });

  if (step === 'REPORT' && report) {
    return (
      <div className="min-h-screen bg-surface-2 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <Button variant="ghost" className="no-print mb-3" onClick={() => setStep('LIST')}>← {t('portal.back')}</Button>
          <ReportDocument data={report} />
        </div>
      </div>
    );
  }

  return (
    <AuthShell title={t('portal.title')} subtitle={t('portal.subtitle')} maxWidth="max-w-md">
        {step === 'MOBILE' && (
          <div className="animate-fade-in space-y-4">
            <div>
              <label className="label">{t('portal.labCode')}</label>
              <input
                value={labCode}
                onChange={(e) => setLabCode(e.target.value)}
                placeholder="arfagma"
                autoCapitalize="none"
                spellCheck={false}
                className="field"
              />
              <p className="mt-1.5 text-xs text-subtle">{t('portal.labCodeHint')}</p>
            </div>
            <div>
              <label className="label">{t('portal.mobile')}</label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="03001234567"
                inputMode="numeric"
                className="field text-lg tracking-wide"
              />
              <p className="mt-1.5 text-xs text-subtle">{t('portal.codeHint')}</p>
            </div>
            {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
            <Button size="lg" className="w-full" onClick={sendCode} loading={isPending} disabled={mobile.trim().length < 11 || labCode.trim().length < 2}>
              {t('portal.sendCode')}
            </Button>
          </div>
        )}

        {step === 'OTP' && (
          <div className="animate-fade-in space-y-4">
            {devCode && (
              <div className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-text">
                {t('portal.demoCode')}:{' '}
                <span className="font-mono text-base font-bold tracking-widest">{devCode}</span>
              </div>
            )}
            <div>
              <label className="label">{t('portal.enterCode')}</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                className="field text-center text-2xl font-bold tracking-[0.5em]"
              />
            </div>
            {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}
            <Button size="lg" className="w-full" onClick={verify} loading={isPending} disabled={code.length < 4}>
              {t('portal.viewReports')}
            </Button>
            <button onClick={() => { setStep('MOBILE'); setCode(''); setError(null); }} className="w-full text-center text-sm text-muted hover:text-body">
              {t('portal.changeNumber')}
            </button>
          </div>
        )}

        {step === 'LIST' && (
          <div className="animate-fade-in space-y-3">
            <div className="section-title">{t('portal.yourReports')}</div>
            {reports.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-3 py-6 text-center text-sm text-subtle">{t('portal.noReports')}</p>
            ) : (
              <ul className="stagger space-y-2">
                {reports.map((r) => (
                  <li key={r.visitId}>
                    <button
                      onClick={() => openReport(r.visitId)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-start transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-body">{r.tests.join(', ')}</span>
                        <span className="text-xs text-muted">{t('billing.slip')} {r.slipNo} · {r.date}</span>
                      </span>
                      <span className="shrink-0 text-brand-600"><FileText className="h-5 w-5" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-line pt-4 text-center">
          <Link href="/login" className="text-xs font-medium text-subtle hover:text-brand-600">
            {t('portal.staffLogin')} →
          </Link>
        </div>
    </AuthShell>
  );
}
