import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { requirePlatformAdmin } from '@/core/platform/session';
import { platformService } from '@/modules/platform/platform.service';
import { formatPkr } from '@/lib/utils';
import { AccessBadge } from './AccessBadge';

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—');

export default async function PlatformHome() {
  await requirePlatformAdmin();
  const labs = await platformService.listLabs();
  const count = (level: string) => labs.filter((l) => l.access.level === level).length;
  const monthly = labs.filter((l) => l.access.level !== 'SUSPENDED').reduce((s, l) => s + l.monthlyFee, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">Labs</h1>
          <p className="text-sm text-muted">
            {labs.length} {labs.length === 1 ? 'lab' : 'labs'} · {count('ACTIVE')} active · {count('GRACE')} overdue · {count('READ_ONLY')} read-only · {count('SUSPENDED')} suspended
            {monthly > 0 && <> · {formatPkr(monthly)} a month</>}
          </p>
        </div>
        <Link href="/platform/labs/new" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New lab
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-start">Lab</th>
              <th className="px-3 py-2.5 text-start">Access</th>
              <th className="px-3 py-2.5 text-start">Plan</th>
              <th className="px-3 py-2.5 text-start">Paid until</th>
              <th className="px-3 py-2.5 text-end">Users</th>
              <th className="px-3 py-2.5 text-end">Bookings</th>
              <th className="px-3 py-2.5 text-start">Last sign-in</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {labs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted">No labs yet. Create the first one with New lab.</td></tr>
            )}
            {labs.map((l) => (
              <tr key={l.id} className="border-b border-line/60 last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link href={`/platform/labs/${l.id}`} className="font-semibold text-strong hover:underline">{l.name}</Link>
                  <div className="font-mono text-xs text-subtle">{l.code}</div>
                </td>
                <td className="px-3 py-3"><AccessBadge level={l.access.level} /></td>
                <td className="px-3 py-3 text-muted">{l.planName ?? '—'}{l.monthlyFee > 0 && <div className="text-xs">{formatPkr(l.monthlyFee)}/month</div>}</td>
                <td className="px-3 py-3 text-muted">{l.paidUntil ? day(l.paidUntil) : 'Not billed'}</td>
                <td className="px-3 py-3 text-end tabular-nums">{l.users}</td>
                <td className="px-3 py-3 text-end tabular-nums">{l.bookings}</td>
                <td className="px-3 py-3 text-muted">{day(l.lastLoginAt)}</td>
                <td className="px-2 py-3"><Link href={`/platform/labs/${l.id}`} aria-label={`Open ${l.name}`}><ChevronRight className="h-4 w-4 text-subtle" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
