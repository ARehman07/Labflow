import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/core/platform/session';
import { platformService } from '@/modules/platform/platform.service';
import { LabDetail } from './LabDetail';

export const dynamic = 'force-dynamic';

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : null);
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : null);
const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

export default async function LabPage({ params }: { params: { id: string } }) {
  await requirePlatformAdmin();
  const lab = await platformService.getLab(params.id);
  if (!lab) notFound();
  return (
    <LabDetail
      lab={{
        id: lab.id, code: lab.code, name: lab.name, isActive: lab.isActive, created: day(lab.createdAt) ?? '',
        access: { level: lab.access.level, reason: lab.access.reason, restrictsOn: day(lab.access.restrictsOn) },
        plan: {
          planName: lab.planName ?? '', monthlyFee: lab.monthlyFee, graceDays: lab.graceDays, maxUsers: lab.maxUsers,
          paidUntil: iso(lab.paidUntil), accessOverride: lab.accessOverride, overrideUntil: iso(lab.overrideUntil),
        },
        counts: lab.counts, activeStaff: lab.activeStaff,
        lastLogin: when(lab.lastLoginAt), lastBooking: when(lab.lastBookingAt),
        locked: lab.locked,
        users: lab.users.map((u) => ({
          id: u.id, fullName: u.fullName, username: u.username, role: u.role.name, isActive: u.isActive,
          mustChangePassword: u.mustChangePassword, lastLoginAt: when(u.lastLoginAt),
          portal: u.partnerLabId ? 'Partner lab portal' : u.doctorId ? 'Doctor portal' : null,
        })),
        payments: lab.payments.map((p) => ({
          id: p.id, paidAt: day(p.paidAt) ?? '', amount: p.amount, months: p.months,
          period: `${day(p.periodFrom)} – ${day(p.periodTo)}`, method: p.method, reference: p.reference, note: p.note, recordedBy: p.recordedBy,
        })),
        audit: lab.audit.map((a) => ({ id: a.id, at: when(a.at) ?? '', who: a.actor?.fullName ?? a.actor?.username ?? null, entity: a.entity, action: a.action })),
        events: lab.events.map((e) => ({ id: e.id, at: when(e.at) ?? '', admin: e.admin, action: e.action, detail: e.detail })),
      }}
    />
  );
}
