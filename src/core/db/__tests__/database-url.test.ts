import { describe, it, expect } from 'vitest';
import { resolveDatabaseUrl, resolveDirectUrl, ensureDatabaseUrl } from '@/core/db/database-url';

const vercelNeon = {
  DATABASE_URL: '',
  STORAGE_DATABASE_URL: 'postgresql://u:p@pooled/db',
  STORAGE_DATABASE_URL_UNPOOLED: 'postgresql://u:p@direct/db',
  STORAGE_PGHOST: 'pooled',
  STORAGE_PGPASSWORD: 'p',
  STORAGE_POSTGRES_PRISMA_URL: 'postgresql://u:p@pooled/db?pgbouncer=true',
  STORAGE_POSTGRES_URL_NON_POOLING: 'postgresql://u:p@direct/db',
  STORAGE_POSTGRES_URL_NO_SSL: 'postgresql://u:p@pooled/db',
} as unknown as NodeJS.ProcessEnv;

describe('database url resolution', () => {
  it('prefers the Prisma-tuned pooled URL for the app', () => {
    expect(resolveDatabaseUrl(vercelNeon)?.name).toBe('STORAGE_POSTGRES_PRISMA_URL');
  });
  it('prefers a direct URL for migrations', () => {
    expect(resolveDirectUrl(vercelNeon)?.name).toBe('STORAGE_DATABASE_URL_UNPOOLED');
  });
  it('ignores an empty DATABASE_URL rather than treating it as set', () => {
    expect(resolveDatabaseUrl(vercelNeon)?.name).not.toBe('DATABASE_URL');
  });
  it('never selects a NO_SSL variant', () => {
    expect(resolveDatabaseUrl(vercelNeon)?.name).not.toMatch(/NO_SSL/);
    expect(resolveDirectUrl(vercelNeon)?.name).not.toMatch(/NO_SSL/);
  });
  it('ignores host/password fragments that are not URLs', () => {
    expect(resolveDatabaseUrl({ STORAGE_PGHOST: 'pooled' } as unknown as NodeJS.ProcessEnv)).toBeUndefined();
  });
  it('an explicit DATABASE_URL still wins', () => {
    const env = { ...vercelNeon, DATABASE_URL: 'postgresql://u:p@explicit/db' } as unknown as unknown as NodeJS.ProcessEnv;
    expect(resolveDatabaseUrl(env)?.name).toBe('DATABASE_URL');
  });
  it('DIRECT_URL wins for migrations when given', () => {
    const env = { ...vercelNeon, DIRECT_URL: 'postgresql://u:p@mine/db' } as unknown as unknown as NodeJS.ProcessEnv;
    expect(resolveDirectUrl(env)?.name).toBe('DIRECT_URL');
  });
  it('fills an empty DATABASE_URL in place', () => {
    const env = { ...vercelNeon } as unknown as NodeJS.ProcessEnv;
    ensureDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@pooled/db?pgbouncer=true');
  });
});
