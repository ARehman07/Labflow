import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listQcMaterialsAction, qcParametersAction } from '@/modules/qc/qc.actions';
import { QcClient } from './QcClient';

export const dynamic = 'force-dynamic';

export default async function QcPage({ searchParams }: { searchParams: { m?: string } }) {
  if (!(await featureOn('lab.qc'))) return <FeatureOff />;
  const [manage, enter, approve] = await Promise.all([can('qc.manage'), can('result.enter'), can('result.approve')]);
  if (!manage && !enter && !approve) return <AccessDenied area="lab" />;
  const [materials, parameters] = await Promise.all([listQcMaterialsAction(true), manage ? qcParametersAction() : Promise.resolve([])]);
  return <QcClient initial={materials} parameters={parameters} canManage={manage} canRecord={enter} selectedId={searchParams.m ?? null} />;
}
