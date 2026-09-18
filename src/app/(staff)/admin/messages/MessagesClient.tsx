'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { SaveBar } from '@/components/ui/SaveBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import { DEFAULT_TEMPLATES, EVENT_VARS, renderTemplate, smsParts } from '@/modules/messages/templates';
import {
  saveMessageTemplatesAction,
  listMessageLogAction,
  type MessageLogDTO,
  type MessageTemplateDTO,
} from '@/modules/messages/messages.actions';

type Filters = { from: string; to: string; channel: string; status: string };

const STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = { SENT: 'success', FAILED: 'danger', SKIPPED: 'neutral' };

/**
 * What the lab tells patients, in its own words, and a record of every message
 * that went out — or did not, and why.
 */
export function MessagesClient({
  canEdit, labName, labCode, sms, email, initialTemplates, initialLog,
}: {
  canEdit: boolean;
  labName: string;
  labCode: string;
  sms: boolean;
  email: boolean;
  initialTemplates: MessageTemplateDTO[];
  initialLog: MessageLogDTO[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'TEMPLATES' | 'LOG'>('TEMPLATES');

  const [list, setList] = useState(initialTemplates);
  const [saved, setSaved] = useState(initialTemplates);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(list.map(({ event, enabled, body }) => [event, enabled, body]))
    !== JSON.stringify(saved.map(({ event, enabled, body }) => [event, enabled, body]));

  // Believable values, so the preview reads like the SMS a patient will get.
  const sample = useMemo(() => ({
    patient: 'Ayesha Khan', lab: labName, slip: '00123', mr: 'MR-000045', tests: 'CBC, Lipid Profile',
    amount: '2,400', due: '400', link: 'https://labflow.pk/portal', code: labCode, partner: 'City Care Lab', ref: 'CC-778',
  }), [labName, labCode]);

  const update = (event: string, patch: Partial<MessageTemplateDTO>) =>
    setList((cur) => cur.map((x) => (x.event === event ? { ...x, ...patch } : x)));

  function save() {
    setError(null);
    startSave(async () => {
      const res = await saveMessageTemplatesAction(list.map(({ event, enabled, body }) => ({ event, enabled, body })));
      if (res.ok) { setList(res.templates); setSaved(res.templates); toast('success', t('msg.saved')); }
      else { setError(res.error); toast('error', res.error); }
    });
  }

  const [log, setLog] = useState(initialLog);
  const [filters, setFilters] = useState<Filters>({ from: '', to: '', channel: '', status: '' });
  const [loadingLog, startLog] = useTransition();
  function filter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    startLog(async () => setLog(await listMessageLogAction(next)));
  }

  return (
    <div className="page">
      <PageHeader title={t('msg.title')} subtitle={t('msg.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      <div className="w-full sm:w-72">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ value: 'TEMPLATES', label: t('msg.tabTemplates') }, { value: 'LOG', label: t('msg.tabLog') }]}
        />
      </div>

      {tab === 'TEMPLATES' ? (
        <>
          {(!sms || !email) && (
            <p className="note-warn text-sm">
              {!sms ? t('msg.smsOff') : t('msg.emailOff')}{' '}
              <Link href="/admin/integrations" className="font-semibold underline">{t('msg.setup')}</Link>
            </p>
          )}

          <div className="grid gap-3">
            {list.map((tp) => {
              const preview = renderTemplate(tp.body, sample);
              const isSms = tp.event !== 'WHATSAPP_REPORT';
              return (
                <Card key={tp.event} className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-strong">{t(`msg.event.${tp.event}`)}</h2>
                      <p className="mt-0.5 text-sm text-muted">{t(`msg.eventDesc.${tp.event}`)}</p>
                    </div>
                    {isSms && (
                      <Switch on={tp.enabled} disabled={!canEdit} label={t(`msg.event.${tp.event}`)} onChange={(v) => update(tp.event, { enabled: v })} />
                    )}
                  </div>

                  <textarea
                    value={tp.body}
                    onChange={(e) => update(tp.event, { body: e.target.value })}
                    readOnly={!canEdit}
                    rows={3}
                    maxLength={600}
                    aria-label={t(`msg.event.${tp.event}`)}
                    className="field mt-3 min-h-[5.5rem] resize-y text-sm"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-subtle">{t('msg.placeholders')}</span>
                    {EVENT_VARS[tp.event].map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => update(tp.event, { body: `${tp.body}${tp.body === '' || tp.body.endsWith(' ') ? '' : ' '}{${v}}` })}
                        className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-body transition-colors hover:bg-brand-500/10 hover:text-brand-700 disabled:cursor-default disabled:opacity-60 dark:hover:text-brand-300"
                      >
                        {`{${v}}`}
                      </button>
                    ))}
                    {isSms && (
                      <span className="ms-auto text-xs tabular-nums text-subtle">
                        {t('msg.chars').replace('{n}', String(preview.length)).replace('{p}', String(smsParts(preview)))}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('msg.preview')}</div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-body">{preview}</p>
                  </div>

                  {canEdit && tp.body !== DEFAULT_TEMPLATES[tp.event] && (
                    <button
                      type="button"
                      onClick={() => update(tp.event, { body: DEFAULT_TEMPLATES[tp.event] })}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-brand-700 dark:hover:text-brand-300"
                    >
                      <RotateCcw className="h-3 w-3" /> {t('msg.reset')}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          {error && <p className="note-danger"><Tr text={error} /></p>}
          {canEdit && (
            <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setList(saved)} saveLabel={t('msg.save')} note={t('msg.saveNote')} />
          )}
        </>
      ) : (
        <>
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="ml-from">{t('msg.logFrom')}</label>
              <DatePicker id="ml-from" value={filters.from} max={filters.to || undefined} onChange={(v) => filter({ from: v })} />
            </div>
            <div>
              <label className="label" htmlFor="ml-to">{t('msg.logTo')}</label>
              <DatePicker id="ml-to" value={filters.to} min={filters.from || undefined} onChange={(v) => filter({ to: v })} />
            </div>
            <div>
              <span className="label">{t('msg.logChannel')}</span>
              <Select
                value={filters.channel}
                onChange={(v) => filter({ channel: v })}
                options={[{ value: '', label: t('msg.any') }, ...['SMS', 'EMAIL'].map((c) => ({ value: c, label: t(`msg.channel.${c}`) }))]}
              />
            </div>
            <div>
              <span className="label">{t('msg.logStatus')}</span>
              <Select
                value={filters.status}
                onChange={(v) => filter({ status: v })}
                options={[{ value: '', label: t('msg.any') }, ...['SENT', 'FAILED', 'SKIPPED'].map((s) => ({ value: s, label: t(`msg.status.${s}`) }))]}
              />
            </div>
          </Card>

          <Card className={cn('overflow-hidden p-0 transition-opacity', loadingLog && 'opacity-60')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <th className="px-4 py-3 text-start font-semibold">{t('msg.logTime')}</th>
                    <th className="px-3 py-3 text-start font-semibold">{t('msg.logEvent')}</th>
                    <th className="px-3 py-3 text-start font-semibold">{t('msg.logTo_')}</th>
                    <th className="px-3 py-3 text-start font-semibold">{t('msg.logMessage')}</th>
                    <th className="px-4 py-3 text-end font-semibold">{t('msg.logStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-subtle">{t('msg.logEmpty')}</td></tr>
                  ) : log.map((m) => (
                    <tr key={m.id} className="align-top transition-colors hover:bg-surface-2">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {m.at}
                        {m.by && <div className="text-[11px] text-subtle">{m.by}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-body">{t(`msg.event.${m.event}`)}</div>
                        <div className="text-[11px] text-subtle">{t(`msg.channel.${m.channel}`)}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-body">{m.to}</td>
                      <td className="max-w-md px-3 py-3">
                        {m.subject && <div className="truncate font-medium text-body">{m.subject}</div>}
                        <div className="line-clamp-2 text-muted" title={m.body}>{m.body}</div>
                        {m.error && <div className="mt-0.5 text-xs text-danger-text"><Tr text={m.error} /></div>}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Badge tone={STATUS_TONE[m.status] ?? 'neutral'} dot>{t(`msg.status.${m.status}`)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {log.length >= 300 && <p className="text-xs text-subtle">{t('msg.logCapped')}</p>}
        </>
      )}
    </div>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <label className={cn('flex shrink-0 items-center gap-2', disabled && 'opacity-60')}>
      <span className={cn('text-xs font-semibold', on ? 'text-ok-text' : 'text-subtle')}>{on ? t('msg.on') : t('msg.off')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-brand-500' : 'bg-surface-3 ring-1 ring-inset ring-line')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'start-[22px]' : 'start-0.5')} />
      </button>
    </label>
  );
}
