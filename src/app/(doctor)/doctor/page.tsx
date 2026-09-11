import { doctorHomeAction } from '@/modules/partners/portal.actions';
import { DoctorHome } from './DoctorHome';

export const dynamic = 'force-dynamic';

export default async function DoctorHomePage() {
  return <DoctorHome data={await doctorHomeAction()} />;
}
