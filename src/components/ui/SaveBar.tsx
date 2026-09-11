'use client';

import { useEffect, type ReactNode } from 'react';
import { useI18n } from '@/core/i18n/I18nProvider';
import { Button } from './Button';

/**
 * The save control for a settings form, pinned to the bottom of the screen.
 *
 * A solid bar rather than a floating button: the floating buttons on Roles,
 * Policy, Letterhead and the test editor sat directly on top of form fields and
 * hid them. It also says when something is unsaved, and the browser asks before
 * a tab with unsaved changes is closed or reloaded.
 */
export function SaveBar({
  dirty, saving, onSave, onDiscard, saveLabel, note, disabled, extra,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel: ReactNode;
  /** Shown when nothing is unsaved, e.g. what saving will affect. */
  note?: ReactNode;
  /** Extra reason saving is not possible yet (invalid form). */
  disabled?: boolean;
  /** A second action beside Save, e.g. "Save & next". */
  extra?: ReactNode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <div className="no-print sticky bottom-24 z-10 md:bottom-3 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-dropdown backdrop-blur">
      <Button onClick={onSave} loading={saving} disabled={!dirty || disabled}>
        {saveLabel}
      </Button>
      {extra}
      {dirty && onDiscard && (
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          {t('save.discard')}
        </Button>
      )}
      {dirty ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-warn-text" role="status">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          {t('save.unsaved')}
        </span>
      ) : (
        note && <span className="text-xs text-muted">{note}</span>
      )}
    </div>
  );
}
