'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { platformLoginAction } from '@/modules/platform/platform.actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60">
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function PlatformLoginForm({ configured }: { configured: boolean }) {
  const [state, action] = useFormState(platformLoginAction, { error: null });
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="text-xl font-extrabold text-strong">Platform sign-in</h1>
        <p className="mt-1 text-sm text-muted">
          For the team that runs LabFlow. Lab owners and staff sign in at{' '}
          <a href="/login" className="font-semibold text-brand-700 underline dark:text-brand-300">/login</a> with their lab code.
        </p>
        {!configured && (
          <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
            No platform admins are set up yet. Add PLATFORM_ADMINS to the server environment.
          </p>
        )}
        <form action={action} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="pa-user">Username</label>
            <input id="pa-user" name="username" autoComplete="username" required className="field" />
          </div>
          <div>
            <label className="label" htmlFor="pa-pass">Password</label>
            <input id="pa-pass" name="password" type="password" autoComplete="current-password" required className="field" />
          </div>
          {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{state.error}</p>}
          <Submit />
        </form>
      </div>
    </div>
  );
}
