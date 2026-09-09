'use client';

import { useState } from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared by "set your password" and "change password" so the rule shown is the
 * rule enforced. Requirements are listed up front and tick as they are met —
 * a form that only tells you the rule after you have broken it wastes a try.
 */
export function PasswordFields({
  newPassword, confirmPassword, onNew, onConfirm,
}: {
  newPassword: string;
  confirmPassword: string;
  onNew: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  const [show, setShow] = useState(false);

  const longEnough = newPassword.length >= 8;
  const noEdgeSpace = newPassword.length === 0 || !/^\s|\s$/.test(newPassword);
  const matches = confirmPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="new-password">New password</label>
        <div className="relative">
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => onNew(e.target.value)}
            autoComplete="new-password"
            className="field pe-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-subtle transition-colors hover:text-body"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="confirm-password">Type it again</label>
        <input
          id="confirm-password"
          type={show ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => onConfirm(e.target.value)}
          autoComplete="new-password"
          className="field"
        />
      </div>

      <ul className="space-y-1 text-xs">
        <Rule ok={longEnough}>At least 8 characters</Rule>
        <Rule ok={noEdgeSpace}>No space at the start or end</Rule>
        <Rule ok={matches}>Both entries match</Rule>
      </ul>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5', ok ? 'text-ok-text' : 'text-subtle')}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-50" />}
      {children}
    </li>
  );
}
