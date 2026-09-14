import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listDocumentsAction, listDocumentTemplatesAction } from '@/modules/documents/documents.actions';
import { DocumentsClient } from './DocumentsClient';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  if (!(await featureOn('patients.documents'))) return <FeatureOff />;
  const [manage, admin] = await Promise.all([can('document.manage'), can('admin.manage')]);
  if (!manage && !admin) return <AccessDenied area="patients" />;
  const [templates, rows] = await Promise.all([listDocumentTemplatesAction(), listDocumentsAction({})]);
  return <DocumentsClient canManage={manage} canTemplates={admin} templates={templates} initial={rows} />;
}
