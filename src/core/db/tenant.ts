import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Tenant isolation.
 *
 * Every tenant-scoped table carries `tenantId`. Rather than trusting each
 * caller to remember a `where` clause, all queries pass through one choke
 * point: the Prisma client extension below injects the tenant filter into
 * every read, write and delete.
 *
 * Two layers of safety:
 *   1. This extension — filters and stamps automatically.
 *   2. `tenantId` is NOT NULL in the schema, so a write that somehow escapes
 *      the extension fails loudly at the database instead of leaking.
 *
 * The list is verified against the schema by src/core/db/tenant.test.ts —
 * adding a scoped model without listing it here fails the test suite.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'Branch',
  'Role',
  'User',
  'Patient',
  'Doctor',
  'PartnerLab',
  'Department',
  'TestGroup',
  'Test',
  'TestPrice',
  'TestParameter',
  'ReferenceRange',
  'ParameterFormula',
  'Visit',
  'Sample',
  'OrderLine',
  'ResultValue',
  'WorkflowEvent',
  'Invoice',
  'Payment',
  'Refund',
  'Commission',
  'LedgerEntry',
  'ReportTemplate',
  'Report',
  'Delivery',
  'QueueToken',
  'Notification',
  'AuditLog',
  'CriticalNotification',
  'NotifiableCondition',
  'NotifiableReport',
  'FamilyCard',
  'FamilyCardMember',
  'PortalOtp',
  'PortalSession',
]);

/** Models deliberately NOT tenant-scoped, with the reason. */
export const GLOBAL_MODELS: Record<string, string> = {
  Tenant: 'the tenant registry itself',
  Permission: 'system-wide permission catalogue, identical for every lab',
  RolePermission: 'join table; scoped transitively through Role',
};

/** Operations whose `where` must be narrowed to the tenant. */
const FILTERED = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Operations whose payload must be stamped with the tenant. */
const STAMPED = new Set(['create', 'createMany', 'upsert']);

export class MissingTenantError extends Error {
  constructor() {
    super('No tenant in context — refusing to run an unscoped query');
    this.name = 'MissingTenantError';
  }
}

/**
 * Returns a Prisma client bound to one tenant.
 *
 * `findUnique`/`update`/`delete` accept the extra `tenantId` filter alongside
 * the unique field (Prisma's extendedWhereUnique, GA since v5), so a row
 * belonging to another lab is simply not found.
 */
export function forTenant(tenantId: string) {
  if (!tenantId) throw new MissingTenantError();

  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);

          const a = args as Record<string, any>;

          if (FILTERED.has(operation)) {
            a.where = { ...(a.where ?? {}), tenantId };
          }

          if (STAMPED.has(operation)) {
            if (operation === 'createMany') {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              a.data = rows.map((row: Record<string, unknown>) => ({ tenantId, ...row }));
            } else if (operation === 'upsert') {
              a.where = { ...(a.where ?? {}), tenantId };
              a.create = { tenantId, ...(a.create ?? {}) };
            } else {
              a.data = { tenantId, ...(a.data ?? {}) };
            }
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;

/**
 * The client handed to an interactive transaction callback on a tenant-scoped
 * client. Not the same type as `Prisma.TransactionClient`, because extensions
 * change the client's shape — but it carries the same isolation.
 */
export type TenantTransactionClient = Omit<
  TenantClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Escape hatch for genuinely cross-tenant work: login (resolving a lab code),
 * migrations, and the seed script. Named so it is obvious in review.
 */
export const unscopedPrisma = prisma;

/** All model names Prisma knows about, from the generated DMMF. */
export function allModelNames(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.name);
}

/** Model names that actually declare a tenantId field. */
export function modelsWithTenantId(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name);
}
