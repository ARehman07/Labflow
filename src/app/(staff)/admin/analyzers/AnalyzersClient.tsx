'use client';

import { useState, useTransition } from 'react';
import { Copy, Cpu, KeyRound, Plus, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Tr } from '@/components/ui/Tr';
import { cn } from '@/lib/utils';
import {
  analyzerMessagesAction,
  createAnalyzerAction,
  listAnalyzersAction,
  setAnalyzerActiveAction,
  setAnalyzerMappingsAction,
  type AnalyzerDTO,
  type AnalyzerMessageDTO,
} from '@/modules/analyzers/analyzers.actions';

const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Connect instruments. Each analyzer gets its own key; its result codes are
 * mapped once to the lab's parameters; every message it sends is listed so a
 * result that did not arrive can be traced.
 */
export function AnalyzersClient({
  initial, parameters, endpoint,
}: {
  initial: AnalyzerDTO[];
  parameters: { id: string; name: string; unit: string | null; test: string }[];
  endpoint: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [analyzers, setAnalyzers] = useState(initial);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<{ code: string; parameterId: string }[]>([]);
  const [messages, setMessages] = useState<AnalyzerMessageDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const reload = () => listAnalyzersAction().then(setAnalyzers);

  function create() {
    setError(null);
    startSave(async () => {
      const res = await createAnalyzerAction(name);
      if (!res.ok) { setError(res.error); return; }
      setNewKey(res.key);
      setName('');
      await reload();
    });
  }

  async function openAnalyzer(a: AnalyzerDTO) {
    if (open === a.id) { setOpen(null); return; }
    setOpen(a.id);
    setRows(a.mappings.length ? a.mappings.map((m) => ({ code: m.code, parameterId: m.parameterId })) : [{ code: '', parameterId: '' }]);
    setMessages(await analyzerMessagesAction(a.id));
  }

  function saveMappings(id: string) {
    startSave(async () => {
      const res = await setAnalyzerMappingsAction(id, rows.filter((r) => r.code.trim() && r.parameterId));
      if (res.ok) { toast('success', t('an.mappingsSaved')); await reload(); }
      else toast('error', res.error);
    });
  }

  const example = JSON.stringify({ barcode: '00014-BLD-9W58', results: [{ code: 'HGB', value: 13.2 }, { code: 'WBC', value: 7.4 }] }, null, 2);

  return (
    <div className="page">
      <PageHeader title={t('an.title')} subtitle={t('an.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      {newKey && (
        <Card className="animate-fade-in-up p-5 ring-1 ring-brand-500/30">
          <h2 className="flex items-center gap-2 font-semibold text-strong"><KeyRound className="h-4 w-4" /> {t('an.keyTitle')}</h2>
          <p className="mt-1 text-xs text-subtle">{t('an.keyHint')}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm font-bold text-strong">{newKey}</code>
            <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(newKey); toast('success', t('an.copied')); }} aria-label={t('handover.copy')}><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setNewKey(null)} aria-label={t('common.close')}><X className="h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('an.namePlaceholder')} aria-label={t('an.name')} className="field min-w-0 flex-1" />
          <Button onClick={create} loading={saving} disabled={name.trim().length < 2}><Plus className="h-4 w-4" /> {t('an.add')}</Button>
        </div>
        {error && <p className="note-danger mt-3"><Tr text={error} /></p>}
      </Card>

      <Card className="p-2">
        {analyzers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t('an.none')}</p>
        ) : (
          <ul className="space-y-1">
            {analyzers.map((a) => (
              <li key={a.id} className="rounded-lg">
                <div className={cn('flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2', !a.isActive && 'opacity-60')}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"><Cpu className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-body">{a.name}</span>
                    <span className="text-xs text-subtle">
                      <span className="font-mono">{a.keyPrefix}…</span> · {t('an.mappedN').replace('{n}', String(a.mappings.length))} · {a.lastSeenAt ? t('an.lastSeen').replace('{time}', fmtTime(a.lastSeenAt)) : t('an.neverSeen')}
                    </span>
                  </span>
                  {!a.isActive && <Badge tone="neutral" size="sm">{t('accounts.inactive')}</Badge>}
                  <Button variant="outline" size="sm" onClick={() => openAnalyzer(a)} aria-expanded={open === a.id}>{t('an.configure')}</Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await setAnalyzerActiveAction(a.id, !a.isActive); await reload(); }}>{a.isActive ? t('an.disable') : t('an.enable')}</Button>
                </div>
                {open === a.id && (
                  <div className="space-y-4 border-t border-line px-3 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-strong">{t('an.mappings')}</h3>
                      <p className="text-xs text-subtle">{t('an.mappingsHint')}</p>
                      <div className="mt-2 space-y-2">
                        {rows.map((r, i) => (
                          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                            <input value={r.code} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="HGB" aria-label={t('an.code')} className="field py-2 font-mono uppercase" />
                            <Select value={r.parameterId} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, parameterId: v } : x)))} placeholder={t('qc.parameter')} options={parameters.map((p) => ({ value: p.id, label: `${p.test} · ${p.name}` }))} />
                            <Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={t('common.remove')}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { code: '', parameterId: '' }])}><Plus className="h-3.5 w-3.5" /> {t('an.addMapping')}</Button>
                        <Button size="sm" onClick={() => saveMappings(a.id)} loading={saving}>{t('an.saveMappings')}</Button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-strong">{t('an.howTo')}</h3>
                      <p className="text-xs text-muted">{t('an.howToHint')}</p>
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs text-body">{`POST ${endpoint}\nAuthorization: Bearer <${t('an.keyWord')}>\nContent-Type: application/json\n\n${example}`}</pre>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-strong">{t('an.messages')}</h3>
                      {messages.length === 0 ? (
                        <p className="text-xs text-muted">{t('an.noMessages')}</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                          {messages.map((m) => (
                            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                              <Badge tone={m.status === 'ACCEPTED' ? 'success' : m.status === 'PARTIAL' ? 'warning' : 'danger'} size="sm">{t(`an.status.${m.status}`)}</Badge>
                              <span className="tabular-nums text-subtle">{fmtTime(m.at)}</span>
                              <span className="font-mono">{m.barcode ?? '—'}</span>
                              <span className="min-w-0 flex-1 text-muted">{m.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
