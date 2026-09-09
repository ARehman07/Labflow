'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

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
const ICONS: Record<ToastKind, string> = { success: '✓', error: '✕', info: 'ℹ' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-dropdown animate-slide-in-right',
              STYLES[t.kind],
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
              {ICONS[t.kind]}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
