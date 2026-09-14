import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { headers } from 'next/headers';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { analyzerParametersAction, listAnalyzersAction } from '@/modules/analyzers/analyzers.actions';
import { AnalyzersClient } from './AnalyzersClient';

export const dynamic = 'force-dynamic';

export default async function AnalyzersPage() {
  if (!(await featureOn('lab.analyzers'))) return <FeatureOff />;
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const [analyzers, parameters] = await Promise.all([listAnalyzersAction(), analyzerParametersAction()]);
  return <AnalyzersClient initial={analyzers} parameters={parameters} endpoint={`${proto}://${host}/api/analyzer/results`} />;
}
