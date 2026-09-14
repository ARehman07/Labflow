import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { tenantDb, currentTenantId, runAsTenant } from '@/core/db/context';
import { unscopedPrisma } from '@/core/db/tenant';
import { labService } from '@/modules/lab/lab.service';
import { canEnterResults, type OrderLineStatus } from '@/modules/lab/workflow';
import { notifyStaff } from '@/modules/notifications/notify';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export interface AnalyzerPayload {
  /** The tube barcode printed on the label, e.g. 00014-BLD-9W58. */
  barcode: string;
  results: { code: string; value: string | number }[];
}

/**
 * Analyzer interfacing.
 *
 * An instrument (or the small bridge program on the PC beside it that reads
 * its serial or LAN output) posts each sample's results as JSON with its own
 * API key. The tube's barcode finds the tests; the instrument's codes (WBC,
 * HGB) are mapped once to the lab's parameters. Values land exactly as if
 * typed — flagged, calculated values worked out, critical callbacks opened —
 * and still go through approval. Every message is kept, so a result that did
 * not land can be traced.
 */
export const analyzersService = {
  async list() {
    const rows = await (await tenantDb()).analyzer.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        mappings: { include: { parameter: { select: { name: true, test: { select: { name: true } } } } }, orderBy: { code: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      keyPrefix: a.keyPrefix,
      isActive: a.isActive,
      lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      messages: a._count.messages,
      mappings: a.mappings.map((m) => ({ code: m.code, parameterId: m.parameterId, parameter: m.parameter.name, test: m.parameter.test.name })),
    }));
  },

  /** Register an instrument. The key is returned once and only its hash is kept. */
  async create(name: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const key = `lfa_${randomBytes(24).toString('base64url')}`;
    // Results need a person to be "entered by". This account cannot sign in
    // and holds no permissions; it only names the instrument on the record.
    const role = await db.role.upsert({
      where: { tenantId_name: { tenantId, name: 'Analyzer' } },
      update: {},
      create: { tenantId, name: 'Analyzer' },
    });
    const user = await db.user.create({
      data: {
        tenantId,
        fullName: `Analyzer: ${name}`,
        username: `analyzer_${randomBytes(4).toString('hex')}`,
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
        roleId: role.id,
        isActive: false,
      },
      select: { id: true },
    });
    await db.analyzer.create({ data: { tenantId, name, keyHash: hashKey(key), keyPrefix: key.slice(0, 8), userId: user.id } });
    return key;
  },

  async setActive(id: string, isActive: boolean) {
    await (await tenantDb()).analyzer.update({ where: { id }, data: { isActive } });
  },

  async setMappings(analyzerId: string, mappings: { code: string; parameterId: string }[]) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    await db.$transaction(async (tx) => {
      await tx.analyzerMapping.deleteMany({ where: { analyzerId } });
      for (const m of mappings) {
        await tx.analyzerMapping.create({ data: { tenantId, analyzerId, code: m.code, parameterId: m.parameterId } });
      }
    });
  },

  async messages(analyzerId: string) {
    const rows = await (await tenantDb()).analyzerMessage.findMany({ where: { analyzerId }, orderBy: { at: 'desc' }, take: 50 });
    return rows.map((m) => ({ id: m.id, at: m.at.toISOString(), barcode: m.barcode, status: m.status, detail: m.detail, payload: m.payload.slice(0, 2000) }));
  },

  /** Handle one posted message. Called by the API route; authenticates by key. */
  async ingest(key: string, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const analyzer = key ? await unscopedPrisma.analyzer.findUnique({ where: { keyHash: hashKey(key) } }) : null;
    if (!analyzer || !analyzer.isActive) return { status: 401, body: { error: 'Unknown or disabled analyzer key.' } };

    return runAsTenant(analyzer.tenantId, async () => {
      const db = await tenantDb();
      const raw = JSON.stringify(payload ?? null).slice(0, 20000);
      const log = async (status: string, detail: string, barcode: string | null) => {
        await db.analyzerMessage.create({ data: { tenantId: analyzer.tenantId, analyzerId: analyzer.id, barcode, payload: raw, status, detail } });
        await db.analyzer.update({ where: { id: analyzer.id }, data: { lastSeenAt: new Date() } });
      };

      const p = payload as Partial<AnalyzerPayload> | null;
      const barcode = typeof p?.barcode === 'string' ? p.barcode.trim().toUpperCase() : '';
      const results = Array.isArray(p?.results) ? p!.results.filter((r) => r && typeof r.code === 'string' && r.value != null && String(r.value).trim() !== '') : [];
      if (!barcode || results.length === 0) {
        await log('REJECTED', 'Send a barcode and at least one result.', barcode || null);
        return { status: 400, body: { error: 'Send a barcode and at least one result.' } };
      }

      const sample = await db.sample.findFirst({
        where: { barcode },
        select: { visit: { select: { slipNo: true } }, orderLines: { select: { id: true, status: true } } },
      });
      if (!sample) {
        await log('REJECTED', `No sample with barcode ${barcode}.`, barcode);
        await notifyStaff(['admin.manage', 'result.enter'], { key: 'notify.analyzerRejected', params: { analyzer: analyzer.name, barcode, reason: 'unknown barcode' } }, { link: '/admin/analyzers', kind: 'ANALYZER' });
        return { status: 404, body: { error: `No sample with barcode ${barcode}.` } };
      }

      const mappings = await db.analyzerMapping.findMany({ where: { analyzerId: analyzer.id }, select: { code: true, parameterId: true } });
      const byCode = new Map(mappings.map((m) => [m.code.toUpperCase(), m.parameterId]));
      const incoming = new Map<string, string>();
      const unmapped: string[] = [];
      for (const r of results) {
        const pid = byCode.get(r.code.toUpperCase());
        if (pid) incoming.set(pid, String(r.value).trim());
        else unmapped.push(r.code);
      }

      let applied = 0;
      const skipped: string[] = [];
      for (const line of sample.orderLines) {
        const entry = await labService.getEntry(line.id);
        if (!entry) continue;
        const mine = entry.test.parameters.filter((prm) => incoming.has(prm.id));
        if (mine.length === 0) continue;
        if (!canEnterResults(line.status as OrderLineStatus)) { skipped.push(entry.test.name); continue; }
        // Keep what is already entered for parameters this instrument does not measure.
        const values: Record<string, string> = {};
        for (const prm of entry.test.parameters) {
          const existing = entry.results.find((x) => x.parameterId === prm.id)?.value;
          if (existing != null) values[prm.code] = existing;
        }
        for (const prm of mine) values[prm.code] = incoming.get(prm.id)!;
        await labService.saveResults(line.id, values, analyzer.userId ?? analyzer.id, undefined, { overrideLock: true });
        applied += mine.length;
      }

      const status = applied === 0 ? 'REJECTED' : unmapped.length || skipped.length ? 'PARTIAL' : 'ACCEPTED';
      const detail = [
        `${applied} value(s) saved`,
        unmapped.length ? `unmapped codes: ${unmapped.join(', ')}` : null,
        skipped.length ? `not open for results: ${skipped.join(', ')}` : null,
      ].filter(Boolean).join('; ');
      await log(status, detail, barcode);
      if (status === 'REJECTED') {
        await notifyStaff(['admin.manage', 'result.enter'], { key: 'notify.analyzerRejected', params: { analyzer: analyzer.name, barcode, reason: detail } }, { link: '/admin/analyzers', kind: 'ANALYZER' });
      }
      return { status: applied > 0 ? 200 : 422, body: { status, applied, unmapped, skipped, slip: sample.visit.slipNo } };
    });
  },
};
