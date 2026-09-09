'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Users, RotateCcw, Info, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
 * Until now this lived only in a seed file, so the answer to "can a
 * receptionist issue a refund?" required reading TypeScript. One role is shown
 * at a time rather than a role × permission grid: a grid of checkboxes is a
 * puzzle, whereas one role's list is a job description you can read.
 *
 * A lab starts with Owner, Manager and Staff. Everything beyond that is added
 * when someone is actually hired into it — either from a ready-made preset or
 * built from nothing.
 */
/** Roles we ship a definition for; only these can be "restored". */
const KNOWN = new Set([
  'Owner', 'Manager', 'Staff',
  'Admin', 'Receptionist', 'Phlebotomist', 'Technician', 'Pathologist', 'Accountant',
]);

export function RolesClient({ initial }: { initial: RoleMatrix }) {
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
      if (res.ok) { await refresh(res.id); setAdding(false); toast('success', `${name} created`); }
      else toast('error', res.error);
    });
  }

  function removeRole(id: string, name: string) {
    startTransition(async () => {
      const res = await deleteRoleAction(id);
      if (res.ok) {
        const remaining = roles.filter((r) => r.id !== id);
        await refresh(remaining[0]?.id);
        toast('success', `${name} deleted`);
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
        toast('success', `${role.name} updated`);
      } else {
        toast('error', res.error);
      }
    });
  }

  function reset() {
    if (!role) return;
    startTransition(async () => {
      const res = await resetRoleToDefaultsAction(role.id);
      if (res.ok) {
        setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, granted: res.granted } : r)));
        setDraft(null);
        toast('success', `${role.name} restored to defaults`);
      } else {
        toast('error', res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/admin"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-strong">Roles &amp; permissions</h1>
          <p className="text-sm text-muted">What each kind of staff member is allowed to do.</p>
        </div>
      </div>

      {/* Pick a role */}
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => { setSelectedId(r.id); setDraft(null); }}
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
          <Plus className="h-3.5 w-3.5" /> New role
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
                {granted.length} of {initial.permissions.length} permissions
                {role.userCount > 0 && ` · ${role.userCount} user${role.userCount === 1 ? '' : 's'}`}
              </p>
            </div>
            {!locked && (
              <div className="flex items-center gap-1">
                {KNOWN.has(role.name) && (
                  <Button variant="ghost" size="sm" onClick={reset} loading={isPending}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restore defaults
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={role.userCount > 0}
                  title={role.userCount > 0 ? 'Move its users to another role first' : undefined}
                  onClick={() => removeRole(role.id, role.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            )}
          </div>

          {locked && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 p-3 text-xs text-subtle">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
              The Owner role always holds every permission. It is how you get back in if another
              role is misconfigured, so it cannot be edited.
            </p>
          )}

          <div className="mt-4 space-y-5">
            {groups.map(([groupName, perms]) => (
              <section key={groupName}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-subtle">{groupName}</h3>
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
                              {p.label}
                            </span>
                            {/* Say what granting it actually lets someone do. */}
                            {p.note && <span className="mt-0.5 block text-xs text-subtle">{p.note}</span>}
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
            <div className="sticky bottom-4 mt-5 flex items-center gap-3">
              <Button onClick={save} loading={isPending} disabled={!dirty}>Save {role.name}</Button>
              {dirty && <Button variant="ghost" onClick={() => setDraft(null)}>Discard</Button>}
              <span className="flex items-center gap-1.5 text-xs text-subtle">
                <Info className="h-3.5 w-3.5" />
                Users see the change the next time they sign in.
              </span>
            </div>
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
  const [name, setName] = useState('');
  const [from, setFrom] = useState<string>('blank');

  const preset = presets.find((p) => p.name === from);
  const codes: string[] = preset ? [...preset.permissions] : [];

  return (
    <Card className="animate-fade-in-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-strong">New role</h2>
          <p className="text-xs text-subtle">
            Start from nothing and tick what it needs, or take a ready-made one and adjust it.
          </p>
        </div>
        <button onClick={onCancel} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-body">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="role-name">Name</label>
          <input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Night shift, Cashier, Sample runner…"
            className="field"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Start from</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFrom('blank')}
              className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                from === 'blank' ? 'bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 dark:text-brand-300'
                                 : 'bg-surface-3 text-muted hover:text-body')}
            >
              Nothing
            </button>
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => { setFrom(p.name); if (!name.trim()) setName(p.name); }}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  from === p.name ? 'bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30 dark:text-brand-300'
                                  : 'bg-surface-3 text-muted hover:text-body')}
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
            <p className="text-xs text-body">{preset.description}</p>
            <p className="mt-1.5 text-[11px] text-subtle">
              Starts with {codes.length} of {permissions.length} permissions:{' '}
              {permissions.filter((p) => codes.includes(p.code)).map((p) => p.label).join(' · ')}
            </p>
          </>
        ) : (
          <p className="text-xs text-subtle">
            Starts with no permissions at all. You tick what it needs after creating it.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={() => onCreate(name.trim(), codes)} loading={busy} disabled={name.trim().length < 2}>
          Create role
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
