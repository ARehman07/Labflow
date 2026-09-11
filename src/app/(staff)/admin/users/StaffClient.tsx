'use client';

import { useState, useTransition } from 'react';
import {
  Plus, Copy, Check, KeyRound, UserX, UserCheck, X, Info, ShieldAlert,
} from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  listStaffAction,
  createStaffAction,
  resetStaffPasswordAction,
  setStaffActiveAction,
  type StaffRow,
} from '@/modules/staff/staff.actions';
import { Tr } from '@/components/ui/Tr';

/**
 * Staff accounts are issued here and nowhere else — there is no sign-up.
 *
 * The temporary password is shown exactly once, at the moment it is created,
 * because it is never stored in readable form. That is also why "reset
 * password" exists: the honest answer to "what was Ali's password?" is that
 * nobody can know, so you issue a new one.
 */
export function StaffClient({
  initial, roles, branches,
}: {
  initial: StaffRow[];
  roles: { id: string; name: string }[];
  branches: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [staff, setStaff] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [handover, setHandover] = useState<{ username: string; tempPassword: string } | null>(null);
  // Which button is working, as "<userId>:<action>". A single page-wide pending
  // flag made every row's buttons spin when one was pressed, which reads as
  // "you just reset everybody's password".
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => listStaffAction().then(setStaff);

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    try { await work(); } finally { setBusy(null); }
  }

  function reset(id: string, name: string) {
    run(`${id}:reset`, async () => {
      const res = await resetStaffPasswordAction(id);
      if (res.ok) { setHandover(res); await refresh(); toast('success', t('staff.pwIssued').replace('{name}', name)); }
      else toast('error', res.error);
    });
  }

  function setActive(id: string, active: boolean, name: string) {
    run(`${id}:active`, async () => {
      const res = await setStaffActiveAction(id, active);
      if (res.ok) {
        await refresh();
        toast('success', (active ? t('staff.reactivated') : t('staff.deactivated')).replace('{name}', name));
      } else toast('error', res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        back={{ href: '/admin', label: t('admin.title') }}
        actions={!adding ? (
          <Button onClick={() => { setAdding(true); setHandover(null); }}>
            <Plus className="h-4 w-4" /> {t('staff.add')}
          </Button>
        ) : undefined}
      />

      {handover && <Handover {...handover} onClose={() => setHandover(null)} />}

      {adding && (
        <AddStaff
          roles={roles}
          branches={branches}
          onCancel={() => setAdding(false)}
          onCreated={async (res) => { setHandover(res); setAdding(false); await refresh(); }}
        />
      )}

      <Card className="p-2">
        <ul className="space-y-0.5">
          {staff.map((u) => (
            <li key={u.id} className="rounded-lg transition-colors hover:bg-surface-2">
              <div className={cn('flex flex-wrap items-center gap-3 px-2 py-2.5', !u.isActive && 'opacity-60')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-600 dark:text-brand-300">
                  {u.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-body">{u.fullName}</span>
                    <Badge tone="neutral" size="sm">{u.role}</Badge>
                    {!u.isActive && <Badge tone="danger" size="sm">{t('staff.badgeDeactivated')}</Badge>}
                    {u.mustChangePassword && u.isActive && (
                      <Badge tone="warning" size="sm">{t('staff.badgePwPending')}</Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-subtle">
                    {u.username}
                    {u.phone && ` · ${u.phone}`}
                    {u.branch && ` · ${u.branch}`}
                    {' · '}
                    {u.lastLoginAt
                      ? t('staff.lastIn').replace('{date}', new Date(u.lastLoginAt).toLocaleDateString('en-GB'))
                      : t('staff.neverIn')}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => reset(u.id, u.fullName)} loading={busy === `${u.id}:reset`}>
                    <KeyRound className="h-3.5 w-3.5" /> {t('staff.resetPw')}
                  </Button>
                  {!u.isSelf && (u.isActive ? (
                    // Locks someone out mid-shift, so it asks first.
                    <ConfirmButton
                      onConfirm={() => setActive(u.id, false, u.fullName)}
                      loading={busy === `${u.id}:active`}
                      prompt={t('staff.deactivatePrompt').replace('{name}', u.fullName)}
                      confirmLabel={t('staff.deactivate')}
                    >
                      <UserX className="h-3.5 w-3.5" /> {t('staff.deactivate')}
                    </ConfirmButton>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setActive(u.id, true, u.fullName)}
                      loading={busy === `${u.id}:active`}>
                      <UserCheck className="h-3.5 w-3.5" /> {t('staff.reactivate')}
                    </Button>
                  ))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-subtle">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        {t('staff.keepRecord')}
      </p>
    </div>
  );
}

/** Shown once. There is no second chance to read this password. */
function Handover({
  username, tempPassword, onClose,
}: { username: string; tempPassword: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the password is on screen to read out anyway */
    }
  }

  return (
    <Card className="animate-fade-in-up p-5 ring-1 ring-brand-500/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold text-strong">{t('handover.title').replace('{username}', username)}</h2>
            <p className="text-xs text-subtle">{t('handover.body')}</p>
          </div>
        </div>
        <button onClick={onClose} aria-label={t('common.close')}
          className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-body">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Readout label={t('handover.username')} value={username} />
        <Readout label={t('handover.temp')} value={tempPassword} mono onCopy={copy} copied={copied} />
      </div>

      <p className="mt-3 text-xs text-muted">{t('handover.next')}</p>
    </Card>
  );
}

function Readout({
  label, value, mono, onCopy, copied,
}: { label: string; value: string; mono?: boolean; onCopy?: () => void; copied?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-base font-bold text-strong', mono && 'font-mono')}>
          {value}
        </span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-3 hover:text-body"
            aria-label={t('handover.copy')}
          >
            {copied ? <Check className="h-4 w-4 text-ok-text" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function AddStaff({
  roles, branches, onCancel, onCreated,
}: {
  roles: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  onCancel: () => void;
  onCreated: (r: { username: string; tempPassword: string }) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createStaffAction({ fullName, username, phone, roleId, branchId });
      if (res.ok) { onCreated(res); toast('success', t('staff.added').replace('{name}', fullName)); }
      else { setError(res.error); }
    });
  }

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-strong">{t('addStaff.title')}</h2>
          <p className="text-xs text-subtle">{t('addStaff.hint')}</p>
        </div>
        <button onClick={onCancel} aria-label={t('common.close')}
          className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-body">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-name">{t('addStaff.fullName')}</label>
          <input
            id="s-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              // A sensible username saves typing; still fully editable.
              if (!username) {
                const guess = e.target.value.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9_.]/g, '') ?? '';
                if (guess.length >= 3) setUsername(guess);
              }
            }}
            className="field"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="s-username">{t('addStaff.username')}</label>
          <input id="s-username" value={username} onChange={(e) => setUsername(e.target.value)} className="field" />
          <p className="mt-1 text-xs text-subtle">{t('addStaff.usernameHint')}</p>
        </div>
        <div>
          <label className="label" htmlFor="s-phone">{t('addStaff.phone')}</label>
          <input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="field" />
        </div>
        <div>
          <label className="label">{t('addStaff.role')}</label>
          <Select value={roleId} onChange={setRoleId} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </div>
        <div>
          <label className="label">{t('addStaff.branch')}</label>
          <Select value={branchId} onChange={setBranchId} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      </div>

      {error && <p className="note-danger mt-3"><Tr text={error} /></p>}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={submit} loading={isPending} disabled={fullName.trim().length < 2 || username.trim().length < 3 || !roleId}>
          {t('addStaff.create')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Card>
  );
}
