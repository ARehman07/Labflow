/**
 * Works out the Postgres connection string, whatever the host chose to call it.
 *
 * Prisma reads exactly one variable — `DATABASE_URL`. Managed Postgres add-ons
 * rarely set that name: Vercel's integration lets you pick a prefix, so the
 * same database can arrive as `POSTGRES_URL`, `STORAGE_URL`, `STORAGE_PRISMA_URL`
 * and so on. When none of them happens to be `DATABASE_URL`, Prisma reports the
 * variable as "an empty string" and the deploy fails on a database that is
 * sitting right there, correctly provisioned.
 *
 * Rather than pinning the repo to one host's naming, resolve it at startup.
 */

/** Checked in order; the first non-empty one wins. */
const CANDIDATES = [
  'DATABASE_URL',
  // Prisma-shaped URLs from Vercel/Neon integrations (already carry pgbouncer flags).
  'POSTGRES_PRISMA_URL',
  'STORAGE_PRISMA_URL',
  // Direct, non-pooled — what migrations actually want.
  'POSTGRES_URL_NON_POOLING',
  'STORAGE_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  // Pooled fall-backs.
  'POSTGRES_URL',
  'STORAGE_URL',
] as const;

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of CANDIDATES) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

/**
 * Ensures `DATABASE_URL` is populated before anything reads it. Safe to call
 * more than once; never overwrites a value that is already set.
 */
export function ensureDatabaseUrl(env: NodeJS.ProcessEnv = process.env): void {
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') return;
  const resolved = resolveDatabaseUrl(env);
  if (resolved) env.DATABASE_URL = resolved;
}
