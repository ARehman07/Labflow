import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { currentPlatformAdmin } from '@/core/platform/session';
import { platformLogoutAction } from '@/modules/platform/platform.actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'LabFlow Platform' };

/** The console for the team that runs LabFlow. Nothing here is reachable with a lab login. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentPlatformAdmin();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/platform" className="flex items-center gap-2.5 font-bold text-strong">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white"><Building2 className="h-4 w-4" /></span>
            LabFlow Platform
          </Link>
          {admin && (
            <form action={platformLogoutAction} className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">{admin}</span>
              <button type="submit" className="rounded-lg border border-line px-3 py-1.5 font-semibold text-body transition-colors hover:bg-surface-2">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
