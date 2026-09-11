import { partnerHomeAction } from '@/modules/partners/portal.actions';
import { PartnerHome } from './PartnerHome';

export const dynamic = 'force-dynamic';

export default async function PartnerHomePage() {
  return <PartnerHome data={await partnerHomeAction()} />;
}
