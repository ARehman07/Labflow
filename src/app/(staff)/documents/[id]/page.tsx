import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { documentsService } from '@/modules/documents/documents.service';
import { DocumentView } from './DocumentView';

export const dynamic = 'force-dynamic';

const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

export default async function DocumentPage({ params }: { params: { id: string } }) {
  if (!(await featureOn('patients.documents'))) return <FeatureOff />;
  const [manage, admin] = await Promise.all([can('document.manage'), can('admin.manage')]);
  if (!manage && !admin) return <AccessDenied area="patients" />;
  const [doc, letterhead] = await Promise.all([documentsService.get(params.id), documentsService.letterhead()]);
  if (!doc) notFound();
  return (
    <DocumentView
      canManage={manage}
      letterhead={letterhead}
      doc={{
        id: doc.id, docNo: doc.docNo, title: doc.title, type: doc.type, body: doc.body, status: doc.status, prints: doc.prints,
        created: fmt(doc.createdAt), finalized: doc.finalizedAt ? fmt(doc.finalizedAt) : null, createdBy: doc.createdBy,
        scan: doc.scanSize != null ? { fileName: doc.scanFileName ?? 'scan', mimeType: doc.scanMimeType ?? '', size: doc.scanSize } : null,
        patient: doc.patient,
      }}
    />
  );
}
