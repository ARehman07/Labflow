'use client';

import { useState, useTransition } from 'react';
import { Building2, KeyRound, Plus, Stethoscope } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Tr } from '@/components/ui/Tr';
import { createPortalLoginAction, listPortalLoginsAction, type PortalLoginDTO } from '@/modules/partners/partners.actions';

/**
 * Logins for people outside the lab: a partner lab that books tests and reads
 * its reports, a referring doctor who reads their patients' reports. They see
 * their own work only, and the password is shown once, like staff accounts.
 */
export function PortalLoginsClient({
  initial, partners, doctors,
}: { initial: PortalLoginDTO[]; partners: { id: string; name: string }[]; doctors: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [logins, setLogins] = useState(initial);
  const [kind, setKind] = useState<'PARTNER' | 'DOCTOR'>(partners.length > 0 ? 'PARTNER' : 'DOCTOR');
  const [entityId, setEntityId] = useState('');
  const [username, setUsername] = useState('');
  const [handover, setHandover] = useState<{ username: string; tempPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const list = kind === 'PARTNER' ? partners : doctors;

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createPortalLoginAction({ kind, entityId, username });
      if (res.ok) { setHandover({ username: res.username, tempPassword: res.tempPassword }); setUsername(''); setLogins(await listPortalLoginsAction()); }
      else setError(res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader title={t('portalLogins.title')} subtitle={t('portalLogins.subtitle')} back={{ href: '/admin', label: t('admin.title') }} />

      {handover && (
        <Card className="animate-fade-in-up p-5 ring-1 ring-brand-500/30">
          <h2 className="flex items-center gap-2 font-semibold text-strong"><KeyRound className="h-4 w-4" /> {t('handover.title').replace('{username}', handover.username)}</h2>
          <p className="mt-1 text-xs text-subtle">{t('handover.body')}</p>
          <div className="mt-3 rounded-xl bg-surface-2 p-3 font-mono text-lg font-bold text-strong">{handover.tempPassword}</div>
          <p className="mt-2 text-xs text-muted">{t('portalLogins.handoverNext')}</p>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <div className="max-w-sm">
          <Segmented
            value={kind}
            onChange={(v) => { setKind(v); setEntityId(''); }}
            options={[
              { value: 'PARTNER', label: t('portalLogins.partner'), icon: <Building2 className="h-4 w-4" /> },
              { value: 'DOCTOR', label: t('portalLogins.doctor'), icon: <Stethoscope className="h-4 w-4" /> },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <span className="label">{kind === 'PARTNER' ? t('portalLogins.partner') : t('portalLogins.doctor')}</span>
            <Select value={entityId} onChange={setEntityId} placeholder={t('portalLogins.choose')} options={list.map((x) => ({ value: x.id, label: x.name }))} />
          </div>
          <div>
            <label className="label" htmlFor="pl-username">{t('addStaff.username')}</label>
            <input id="pl-username" value={username} onChange={(e) => setUsername(e.target.value)} className="field" autoCapitalize="none" spellCheck={false} />
          </div>
          <Button onClick={create} loading={isPending} disabled={!entityId || username.trim().length < 3}><Plus className="h-4 w-4" /> {t('portalLogins.create')}</Button>
        </div>
        {error && <p className="note-danger"><Tr text={error} /></p>}
      </Card>

      <Card className="p-2">
        {logins.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t('portalLogins.none')}</p>
        ) : (
          <ul className="space-y-0.5">
            {logins.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  {u.kind === 'PARTNER' ? <Building2 className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-body">{u.entityName}</span>
                  <span className="text-xs text-subtle">{u.username} · {u.lastLoginAt ? t('staff.lastIn').replace('{date}', new Date(u.lastLoginAt).toLocaleDateString('en-GB')) : t('staff.neverIn')}</span>
                </span>
                <Badge tone="neutral" size="sm">{u.kind === 'PARTNER' ? t('portalLogins.partner') : t('portalLogins.doctor')}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
