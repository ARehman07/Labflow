'use client';

import { useMemo, useState, useTransition } from 'react';
import { Lock, Users, RotateCcw, Plus, Trash2, X } from 'lucide-react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { SaveBar } from '@/components/ui/SaveBar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  setRolePermissionsAction,
  resetRoleToDefaultsAction,
  createRoleAction,
  deleteRoleAction,
  getRoleMatrixAction,
  type RoleMatrix,
} from '@/modules/roles/roles.actions';

/**
 * Who can do what, in one place.
 *
 * One role is shown at a time rather than a role × permission grid: a grid of
 * checkboxes is a puzzle, whereas one role's list is a job description you can
 * read. A lab starts with Owner, Manager and Staff; anything beyond that is
 * added when someone is actually hired into it.
 */
/** Roles we ship a definition for; only these can be "restored". */
const KNOWN = new Set([
  'Owner', 'Manager', 'Staff',
  'Admin', 'Receptionist', 'Phlebotomist', 'Technician', 'Pathologist', 'Accountant',
]);

/**
 * Permission names are translated by code. If a translation is missing — a
 * permission added on the server and not yet here — the server's English label
 * is shown rather than a raw key.
 */
function useLabel() {
  const { t } = useI18n();
  return (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
}

export function RolesClient({ initial }: { initial: RoleMatrix }) {
  const { t } = useI18n();
  const label = useLabel();
  const toast = useToast();
  const [roles, setRoles] = useState(initial.roles);
  const [selectedId, setSelectedId] = useState(
    initial.roles.find((r) => !r.isSystem)?.id ?? initial.roles[0]?.id ?? '',
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const [presets, setPresets] = useState(initial.availablePresets);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = (nextId?: string) =>
    getRoleMatrixAction().then((m) => {
      setRoles(m.roles);
      setPresets(m.availablePresets);
      setDraft(null);
      if (nextId) setSelectedId(nextId);
    });

  function addRole(name: string, codes: string[]) {
    startTransition(async () => {
      const res = await createRoleAction(name, codes);
      if (res.ok) { await refresh(res.id); setAdding(false); toast('success', t('roles.created').replace('{name}', name)); }
      else toast('error', res.error);
    });
  }

  function removeRole(id: string, name: string) {
    startTransition(async () => {
      const res = await deleteRoleAction(id);
      if (res.ok) {
        const remaining = roles.filter((r) => r.id !== id);
        await refresh(remaining[0]?.id);
        toast('success', t('roles.deleted').replace('{name}', name));
      } else toast('error', res.error);
    });
  }

  const role = roles.find((r) => r.id === selectedId);
  const granted = draft ?? role?.granted ?? [];
  const dirty = draft != null && role != null
    && JSON.stringify([...draft].sort()) !== JSON.stringify([...role.granted].sort());

  const groups = useMemo(() => {
    const by = new Map<string, typeof initial.permissions>();
    for (const p of initial.permissions) {
      if (!by.has(p.group)) by.set(p.group, []);
      by.get(p.group)!.push(p);
    }
    return [...by.entries()];
  }, [initial]);

  const locked = role?.name === 'Owner';

  function toggle(code: string) {
    if (locked) return;
    const next = granted.includes(code) ? granted.filter((c) => c !== code) : [...granted, code];
    setDraft(next);
  }

  function save() {
    if (!role || !draft) return;
    startTransition(async () => {
      const res = await setRolePermissionsAction(role.id, draft);
      if (res.ok) {
        setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, granted: res.granted } : r)));
        setDraft(null);
        toast('success', t('roles.updated').replace('{name}', role.name));
      } else toast('error', res.error);
    });
  }

  function reset() {
    if (!role) return;
    startTransition(async () => {
      const res = await resetRoleToDefaultsAction(role.id);
      if (res.ok) {
        setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, granted: res.granted } : r)));
        setDraft(null);
        toast('success', t('roles.restored').replace('{name}', role.name));
      } else toast('error', res.error);
    });
  }

  return (
    <div className="page">
      <PageHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        back={{ href: '/admin', label: t('admin.title') }}
      />

      {/* Pick a role */}
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => { setSelectedId(r.id); setDraft(null); }}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-line bg-surface text-muted hover:border-brand-300 hover:text-brand-600',
              )}
            >
              {r.name === 'Owner' && <Lock className="h-3 w-3" />}
              {r.name}
              <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 text-xs tabular-nums',
                active ? 'bg-white/20' : 'bg-surface-3 text-muted')}>
                <Users className="h-2.5 w-2.5" />{r.userCount}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <Plus className="h-3.5 w-3.5" /> {t('roles.new')}
        </button>
      </div>

      {adding && (
        <AddRole
          presets={presets}
          permissions={initial.permissions}
          busy={isPending}
          onCancel={() => setAdding(false)}
          onCreate={addRole}
        />
      )}

      {role && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-strong">{role.name}</h2>
              <p className="text-xs text-subtle">
                {t('roles.countOf').replace('{n}', String(granted.length)).replace('{total}', String(initial.permissions.length))}
                {role.userCount > 0 && ` · ${role.userCount === 1 ? t('roles.users1') : t('roles.usersN').replace('{n}', String(role.userCount))}`}
              </p>
            </div>
            {!locked && (
              <div className="flex flex-wrap items-center gap-1">
                {/* Both replace or remove what an owner configured, so each asks first, in place. */}
                {KNOWN.has(role.name) && (
                  <ConfirmButton
                    onConfirm={reset}
                    loading={isPending}
                    prompt={t('roles.restorePrompt').replace('{name}', role.name)}
                    confirmLabel={t('roles.restore')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {t('roles.restoreDefaults')}
                  </ConfirmButton>
                )}
                {role.userCount > 0 ? (
                  <Button variant="ghost" size="sm" disabled title={t('roles.moveUsersFirst')}>
                    <Trash2 className="h-3.5 w-3.5" /> {t('roles.delete')}
                  </Button>
                ) : (
                  <ConfirmButton
                    onConfirm={() => removeRole(role.id, role.name)}
                    loading={isPending}
                    prompt={t('roles.deletePrompt').replace('{name}', role.name)}
                    confirmLabel={t('roles.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('roles.delete')}
                  </ConfirmButton>
                )}
              </div>
            )}
          </div>

          {locked && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 p-3 text-xs text-subtle">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
              {t('roles.ownerLocked')}
            </p>
          )}

          <div className="mt-4 space-y-5">
            {groups.map(([groupName, perms]) => (
              <section key={groupName}>
                <h3 className="section-title">{label(`permGroup.${groupName}`, groupName)}</h3>
                <ul className="mt-1.5 space-y-0.5">
                  {perms.map((p) => {
                    const on = granted.includes(p.code);
                    return (
                      <li key={p.code}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={locked}
                          onClick={() => toggle(p.code)}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-lg px-2 py-2 text-start transition-colors',
                            locked ? 'cursor-not-allowed opacity-70' : 'hover:bg-surface-2',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors',
                              on ? 'bg-brand-500 text-white' : 'bg-surface-3 ring-1 ring-inset ring-line',
                            )}
                          >
                            {on && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-sm', on ? 'font-medium text-body' : 'text-muted')}>
                              {label(`perm.${p.code}`, p.label)}
                            </span>
                            {/* Say what granting it actually lets someone do. */}
                            {p.note && (
                              <span className="mt-0.5 block text-xs text-subtle">{label(`permNote.${p.code}`, p.note)}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {!locked && (
            <SaveBar
              dirty={dirty}
              saving={isPending}
              onSave={save}
              onDiscard={() => setDraft(null)}
              saveLabel={t('roles.save').replace('{name}', role.name)}
              note={t('roles.saveNote')}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function AddRole({
  presets, permissions, busy, onCancel, onCreate,
}: {
  presets: RoleMatrix['availablePresets'];
  permissions: RoleMatrix['permissions'];
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, codes: string[]) => void;
}) {
  const { t } = useI18n();
  const label = useLabel();
  const [name, setName] = useState('');
  const [from, setFrom] = useState<string>('blank');

  const preset = presets.find((p) => p.name === from);
  const codes: string[] = preset ? [...preset.permissions] : [];

  const pill = (active: boolean) => cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
    active ? 'bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 dark:text-brand-300'
           : 'bg-surface-3 text-muted hover:text-body');

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-strong">{t('roles.new')}</h2>
          <p className="text-xs text-subtle">{t('roles.newHint')}</p>
        </div>
        <button onClick={onCancel} aria-label={t('common.close')}
          className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-body">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="role-name">{t('roles.name')}</label>
          <input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('roles.namePlaceholder')}
            className="field"
            autoFocus
          />
        </div>
        <div>
          <label className="label">{t('roles.startFrom')}</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFrom('blank')} aria-pressed={from === 'blank'} className={pill(from === 'blank')}>
              {t('roles.nothing')}
            </button>
            {presets.map((p) => (
              <button
                key={p.name}
                aria-pressed={from === p.name}
                onClick={() => { setFrom(p.name); if (!name.trim()) setName(p.name); }}
                className={pill(from === p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Say what the chosen starting point actually grants, before it is created. */}
      <div className="mt-3 rounded-xl bg-surface-2 p-3">
        {preset ? (
          <>
            <p className="text-xs text-body">{label(`preset.${preset.name}`, preset.description)}</p>
            <p className="mt-1.5 text-[11px] text-subtle">
              {t('roles.startsWith').replace('{n}', String(codes.length)).replace('{total}', String(permissions.length))}{' '}
              {permissions.filter((p) => codes.includes(p.code)).map((p) => label(`perm.${p.code}`, p.label)).join(' · ')}
            </p>
          </>
        ) : (
          <p className="text-xs text-subtle">{t('roles.startsEmpty')}</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={() => onCreate(name.trim(), codes)} loading={busy} disabled={name.trim().length < 2}>
          {t('roles.create')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Card>
  );
}
