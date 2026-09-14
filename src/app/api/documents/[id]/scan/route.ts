import { NextResponse } from 'next/server';
import { can } from '@/core/rbac/guard';
import { documentsService } from '@/modules/documents/documents.service';

export const dynamic = 'force-dynamic';

/** Open a document's signed scan inline, for staff who handle patient forms. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await can('document.manage')) && !(await can('admin.manage'))) return new NextResponse('Not allowed', { status: 403 });
  const row = await documentsService.scan(params.id);
  if (!row?.scanData || !row.scanMimeType) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(row.scanData), {
    headers: {
      'Content-Type': row.scanMimeType,
      'Content-Disposition': `inline; filename="${(row.scanFileName ?? 'scan').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
