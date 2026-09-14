'use client';

import Link from 'next/link';
import { CheckCircle2, CircleDashed, Cpu, Mail, MessageSquare, Sparkles, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';

/**
 * Outside services the lab can switch on. Their keys live in the server
 * environment (on Vercel: Project → Settings → Environment Variables), never in
 * the database, so this page only says which are working and what to set.
 */
export function IntegrationsClient({ status }: { status: { email: boolean; sms: boolean; ai: boolean } }) {
  const { t } = useI18n();
  const rows: { key: string; icon: LucideIcon; on: boolean; vars: string }[] = [
    { key: 'email', icon: Mail, on: status.email, vars: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM' },
    { key: 'sms', icon: MessageSquare, on: status.sms, vars: 'SMS_API_URL, SMS_API_KEY, SMS_API_METHOD' },
    { key: 'ai', icon: Sparkles, on: status.ai, vars: 'ANTHROPIC_API_KEY' },
  ];
  return (
    <div className="page">
      <PageHeader title={t('int.title')} subtitle={t('int.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.key} className="flex flex-wrap items-start gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><r.icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-strong">{t(`int.${r.key}.title`)}</h2>
              <p className="text-sm text-muted">{t(`int.${r.key}.desc`)}</p>
              {!r.on && <p className="mt-2 text-xs text-subtle">{t('int.setVars')} <code className="font-mono text-body">{r.vars}</code></p>}
            </div>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', r.on ? 'bg-ok-soft text-ok-text' : 'bg-surface-3 text-muted')}>
              {r.on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
              {r.on ? t('int.on') : t('int.off')}
            </span>
          </Card>
        ))}
        <Card className="flex flex-wrap items-start gap-4 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Cpu className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-strong">{t('int.analyzers.title')}</h2>
            <p className="text-sm text-muted">{t('int.analyzers.desc')}</p>
          </div>
          <Link href="/admin/analyzers" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">{t('int.analyzers.open')}</Link>
        </Card>
      </div>
    </div>
  );
}
