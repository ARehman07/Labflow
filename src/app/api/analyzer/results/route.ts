import { NextResponse } from 'next/server';
import { analyzersService } from '@/modules/analyzers/analyzers.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analyzer/results
 * Authorization: Bearer <analyzer key>
 * { "barcode": "00014-BLD-9W58", "results": [{ "code": "HGB", "value": 13.2 }] }
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const key = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : (req.headers.get('x-analyzer-key') ?? '').trim();
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const res = await analyzersService.ingest(key, payload);
  return NextResponse.json(res.body, { status: res.status });
}
