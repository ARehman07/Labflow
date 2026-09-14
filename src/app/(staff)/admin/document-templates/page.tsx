import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listDocumentTemplatesAction } from '@/modules/documents/documents.actions';
import { DocumentTemplatesClient } from './DocumentTemplatesClient';

export const dynamic = 'force-dynamic';

export default async function DocumentTemplatesPage() {
  if (!(await featureOn('patients.documents'))) return <FeatureOff />;
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  const [list, tenant] = await Promise.all([
    listDocumentTemplatesAction(true),
    (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true } }),
  ]);
  return <DocumentTemplatesClient initial={list} labName={tenant?.name ?? ''} />;
}
