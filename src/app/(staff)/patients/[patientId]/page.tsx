import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { getPatientProfileAction } from '@/modules/patients/patients.actions';
import { PatientProfileClient } from './PatientProfileClient';

export const dynamic = 'force-dynamic';

export default async function PatientPage({ params }: { params: { patientId: string } }) {
  const allowed = (await Promise.all([
    can('visit.create'), can('patient.manage'), can('billing.view'), can('result.enter'),
  ])).some(Boolean);
  if (!allowed) return <AccessDenied area="patients" />;

  const profile = await getPatientProfileAction(params.patientId);
  if (!profile) notFound();
  return <PatientProfileClient profile={profile} />;
}
