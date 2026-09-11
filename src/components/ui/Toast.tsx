'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Check, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/core/i18n/I18nProvider';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

const STYLES: Record<ToastKind, string> = {
  success: 'border-ok-line bg-ok-soft text-ok-text',
  error: 'border-danger-line bg-danger-soft text-danger-text',
  info: 'border-line bg-surface text-body',
};
const ICONS: Record<ToastKind, LucideIcon> = { success: Check, error: X, info: Info };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { tr } = useI18n();

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 end-4 z-[100] md:bottom-4 flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-dropdown animate-slide-in-right',
              STYLES[t.kind],
            )}
          >
            {(() => {
              const Icon = ICONS[t.kind];
              return (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-current/10">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              );
            })()}
            {tr(t.message)}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
