import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { QueueClient } from './QueueClient';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  if (!(await featureOn('lab.queue'))) return <FeatureOff />;
  const canManage = await can('workflow.advance');
  return <QueueClient canManage={canManage} />;
}
