import { can } from '@/core/rbac/guard';
import { QueueClient } from './QueueClient';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const canManage = await can('workflow.advance');
  return <QueueClient canManage={canManage} />;
}
