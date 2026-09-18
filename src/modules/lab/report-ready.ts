import { tenantDb, currentTenantId } from '@/core/db/context';
import { messagesService } from '@/modules/messages/messages.service';
import { reportHold } from '@/modules/billing/report-hold';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'] as const;

/**
 * Tell the patient their report is ready — once, and only when it may go out.
 *
 * Called when a slip's last test is approved, when a payment settles a bill,
 * and when a held report is released by hand: whichever comes last is the
 * moment the report is both ready and allowed out. Sent at most once per slip
 * (a skipped attempt, with no SMS set up, counts), so a re-approval or a
 * second payment never texts the patient twice.
 */
export async function tellPatientWhenReleasable(visitId: string, userId?: string) {
  const db = await tenantDb();
  const [open, released, told] = await Promise.all([
    db.orderLine.count({ where: { visitId, status: { notIn: [...RELEASED, 'CANCELLED'] } } }),
    db.orderLine.count({ where: { visitId, status: { in: [...RELEASED] } } }),
    db.messageLog.count({ where: { visitId, event: 'REPORT_READY' } }),
  ]);
  if (open > 0 || released === 0 || told > 0) return;
  if ((await reportHold(visitId, await currentTenantId())).held) return;
  await messagesService.notify('REPORT_READY', visitId, {}, userId);
}
