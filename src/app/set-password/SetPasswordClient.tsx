'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { setInitialPasswordAction } from '@/modules/account/account.actions';
import { PasswordFields } from '@/components/account/PasswordFields';

export function SetPasswordClient({ name }: { name: string }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await setInitialPasswordAction({ newPassword, confirmPassword });
      if (res.ok) { router.replace('/dashboard'); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-bold text-strong">Choose your password</h1>
            <p className="text-sm text-muted">Welcome, {name}.</p>
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          The password you were given is temporary and someone else knows it.
          Pick one only you know before you carry on.
        </p>

        <div className="mt-4">
          <PasswordFields
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            onNew={setNewPassword}
            onConfirm={setConfirm}
          />
        </div>

        {error && <p className="note-danger mt-3">{error}</p>}

        <Button type="submit" className="mt-4 w-full" loading={isPending} disabled={newPassword.length < 8}>
          Save and continue
        </Button>
      </form>
    </div>
  );
}
