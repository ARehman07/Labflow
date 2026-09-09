import { describe, it, expect } from 'vitest';
import {
  TENANT_SCOPED_MODELS,
  GLOBAL_MODELS,
  allModelNames,
  modelsWithTenantId,
} from '../tenant';

/**
 * Coverage guard.
 *
 * The isolation extension can only filter models it knows about. If someone
 * adds a tenant-scoped model to the schema and forgets TENANT_SCOPED_MODELS,
 * every query against it would silently span all labs. These tests make that
 * a build failure instead.
 */
describe('tenant isolation coverage', () => {
  it('lists every model that declares a tenantId', () => {
    const missing = modelsWithTenantId().filter((m) => !TENANT_SCOPED_MODELS.has(m));
    expect(missing, `add to TENANT_SCOPED_MODELS: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not list models without a tenantId', () => {
    const withTenant = new Set(modelsWithTenantId());
    const bogus = [...TENANT_SCOPED_MODELS].filter((m) => !withTenant.has(m));
    expect(bogus, `these have no tenantId column: ${bogus.join(', ')}`).toEqual([]);
  });

  it('accounts for every model in the schema', () => {
    const unaccounted = allModelNames().filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !(m in GLOBAL_MODELS),
    );
    expect(
      unaccounted,
      `classify each as scoped or global: ${unaccounted.join(', ')}`,
    ).toEqual([]);
  });

  it('documents why each global model is exempt', () => {
    for (const [model, reason] of Object.entries(GLOBAL_MODELS)) {
      expect(reason.length, `${model} needs a reason`).toBeGreaterThan(10);
    }
  });
});
