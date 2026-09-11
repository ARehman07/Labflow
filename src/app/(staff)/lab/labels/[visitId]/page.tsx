import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { labService } from '@/modules/lab/lab.service';
import { LabelsClient, type LabelData } from './LabelsClient';

export const dynamic = 'force-dynamic';

export default async function LabelsPage({ params }: { params: { visitId: string } }) {
  const allowed = (await can('sample.collect')) || (await can('workflow.advance'));
  if (!allowed) return <AccessDenied area="lab" />;

  const v = await labService.getLabels(params.visitId);
  if (!v) notFound();

  const data: LabelData = {
    slipNo: v.slipNo,
    patientName: v.patient.fullName,
    mrNo: v.patient.mrNo,
    age: v.patient.age,
    sex: v.patient.sex,
    samples: v.samples.map((s) => ({
      id: s.id,
      barcode: s.barcode,
      specimenType: s.specimenType,
      collectedAt: s.collectedAt ? s.collectedAt.toISOString() : null,
      tests: s.orderLines.map((l) => l.test.name),
    })),
  };
  return <LabelsClient data={data} />;
}
