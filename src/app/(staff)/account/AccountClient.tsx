'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { User, Shield, Building2, KeyRound, Phone, AtSign, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeading, ACCENT } from '@/components/ui/List';
import { useToast } from '@/components/ui/Toast';
import { PasswordFields } from '@/components/account/PasswordFields';
import { cn } from '@/lib/utils';
import {
  updateProfileAction,
  changePasswordAction,
  type MyAccount,
} from '@/modules/account/account.actions';

/**
 * Your own account. Split into what you may change (name, phone, password) and
 * what only an owner may change (username, role, branch) — showing the second
 * group read-only answers "why can't I edit this?" without anyone having to ask.
 */
export function AccountClient({ initial }: { initial: MyAccount }) {
  const toast = useToast();
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [savedProfile, setSavedProfile] = useState({ fullName: initial.fullName, phone: initial.phone ?? '' });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePending, startProfile] = useTransition();

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwPending, startPw] = useTransition();

  const profileDirty = fullName !== savedProfile.fullName || phone !== savedProfile.phone;

  function saveProfile() {
    setProfileError(null);
    startProfile(async () => {
      const res = await updateProfileAction({ fullName, phone });
      if (res.ok) {
        setSavedProfile({ fullName, phone });
        toast('success', 'Profile updated');
        router.refresh(); // the name in the top bar comes from the session
      } else setProfileError(res.error);
    });
  }

  function savePassword() {
    setPwError(null);
    startPw(async () => {
      const res = await changePasswordAction({ currentPassword, newPassword, confirmPassword });
      if (res.ok) {
        setCurrent(''); setNew(''); setConfirm('');
        toast('success', 'Password changed');
      } else setPwError(res.error);
    });
  }

  const initials = fullName.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        {/* Initials, not an upload: there is no file storage configured yet, and
            a broken avatar button is worse than none. */}
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-strong">{savedProfile.fullName}</h1>
          <p className="text-sm text-muted">
            {initial.role} · {initial.branchName ?? 'No branch'} · {initial.tenantName}
          </p>
        </div>
      </div>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.brand}>Your details</SectionHeading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="acc-name">Full name</label>
            <input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="acc-phone">Phone</label>
            <div className="relative">
              <Phone className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3.5 h-4 w-4 text-subtle" />
              <input
                id="acc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="03001234567"
                className="field ps-10"
              />
            </div>
          </div>
        </div>
        {profileError && <p className="note-danger mt-3">{profileError}</p>}
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={saveProfile} loading={profilePending} disabled={!profileDirty || fullName.trim().length < 2}>
            Save details
          </Button>
          {profileDirty && (
            <Button variant="ghost" onClick={() => { setFullName(savedProfile.fullName); setPhone(savedProfile.phone); }}>
              Discard
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading accent={ACCENT.amber}>Change password</SectionHeading>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="acc-current">Current password</label>
            <input
              id="acc-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="field"
            />
          </div>
          <PasswordFields
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            onNew={setNew}
            onConfirm={setConfirm}
          />
        </div>
        {pwError && <p className="note-danger mt-3">{pwError}</p>}
        <Button
          className="mt-4"
          onClick={savePassword}
          loading={pwPending}
          disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
        >
          Change password
        </Button>
      </Card>

      <Card className="p-5">
        <SectionHeading>Set by your lab</SectionHeading>
        <p className="-mt-1 mb-3 text-xs text-subtle">
          Ask whoever manages users at {initial.tenantName} to change any of these.
        </p>
        <dl className="space-y-0.5">
          <ReadOnly icon={AtSign} label="Username" value={initial.username} />
          <ReadOnly icon={Shield} label="Role" value={initial.role} />
          <ReadOnly icon={Building2} label="Branch" value={initial.branchName ?? '—'} />
          <ReadOnly
            icon={Clock}
            label="Last signed in"
            value={initial.lastLoginAt ? new Date(initial.lastLoginAt).toLocaleString('en-GB') : '—'}
          />
        </dl>
      </Card>
    </div>
  );
}

function ReadOnly({
  icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-2 py-2')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-subtle">
        <Icon className="h-4 w-4" />
      </span>
      <dt className="min-w-0 flex-1 text-xs font-medium text-subtle">{label}</dt>
      <dd className="truncate text-sm font-semibold text-body">{value}</dd>
    </div>
  );
}
