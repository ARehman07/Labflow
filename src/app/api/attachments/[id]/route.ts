import { NextResponse } from 'next/server';
import { can } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';

export const dynamic = 'force-dynamic';

/** Open an attached file inline (a PDF or photo), for staff who can see the booking. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const checks = await Promise.all([can('visit.create'), can('result.enter'), can('result.approve'), can('billing.view'), can('report.print')]);
  if (!checks.some(Boolean)) return new NextResponse('Not allowed', { status: 403 });
  const row = await (await tenantDb()).attachment.findUnique({
    where: { id: params.id },
    select: { fileName: true, mimeType: true, data: true },
  });
  if (!row) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Disposition': `inline; filename="${row.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
