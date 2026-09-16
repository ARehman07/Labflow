import { perRequest } from './memo';
import { currentTenantId } from './context';
import { unscopedPrisma } from './tenant';

/**
 * The lab's own settings row, read once per request.
 *
 * Result locks, refund windows, self-verification and the family-card rates all
 * live on the tenant row, and each was fetched separately wherever it was
 * needed — a bulk approve of sixty results read the same row sixty times. One
 * cached read serves them all; a change lands on the next request.
 */
export const labPolicy = perRequest(async () => {
  const id = await currentTenantId();
  return unscopedPrisma.tenant.findUniqueOrThrow({
    where: { id },
    select: {
      allowSelfVerify: true,
      resultEditLockMins: true,
      refundWindowHours: true,
      reportHistoryColumns: true,
      reportHistoryMonths: true,
      reportHistoryByDefault: true,
      familyCardDiscountPct: true,
      familyCardMemberCap: true,
      familyCardFee: true,
      familyCardDiscountOnIssue: true,
    },
  });
});
