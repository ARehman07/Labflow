import { partnerStatementAction } from '@/modules/partners/portal.actions';
import { PartnerStatement } from './PartnerStatement';

export const dynamic = 'force-dynamic';

export default async function PartnerStatementPage() {
  return <PartnerStatement data={await partnerStatementAction()} />;
}
