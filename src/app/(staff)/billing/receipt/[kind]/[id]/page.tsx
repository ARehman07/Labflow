import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { billingService } from '@/modules/billing/billing.service';
import { ReceiptView } from './ReceiptView';

export const dynamic = 'force-dynamic';

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

export default async function ReceiptPage({ params }: { params: { kind: string; id: string } }) {
  if (!(await can('billing.view'))) return <AccessDenied area="billing" />;
  if (params.kind !== 'payment' && params.kind !== 'refund') notFound();
  const r = await billingService.getReceipt(params.kind, params.id);
  if (!r) notFound();
  return <ReceiptView data={{ ...r, at: fmt(r.at) }} />;
}
